// The test database is one PostgreSQL session (PGlite) behind a socket server that several connections share: the
// site's and those of the specs. A connection's exchange is several messages (Parse, Bind, Describe, Execute, then
// Sync), and the socket server (@electric-sql/pglite-socket 0.2.11) queues each message on its own: it keeps a
// connection's messages together only inside a transaction. So when a spec's query waited behind a transaction of
// the site, the two went on message by message after the commit, into the one session: the site's Bind or Sync
// replaced or closed the spec's unnamed portal between its Bind and its Execute, and the spec failed with
// `portal "" does not exist` (or read the rows of the other query). Upstream: electric-sql/pglite#1046 (open).
//
// serializeBatches() makes the server's queue keep the session for one connection from its first message until the
// protocol is at rest again: after a Sync, a simple query, a Terminate or the startup message, outside a
// transaction. The other connections wait meanwhile, as they would for a lock, and nobody's messages are mixed.
// A connection that leaves while it holds the session gives it back at rest (Sync, then a rollback if a
// transaction was left open). An internal error no longer stops the queue for every connection.

const SYNC = Uint8Array.of(0x53, 0, 0, 0, 4);
const ROLLBACK = (() => {
	const text = new TextEncoder().encode('ROLLBACK\0');
	const message = new Uint8Array(5 + text.length);
	message[0] = 0x51;
	new DataView(message.buffer).setInt32(1, 4 + text.length);
	message.set(text, 5);
	return message;
})();

/** True when the protocol is at rest after this message (unless a transaction is open). */
function atRest(message) {
	const type = message[0];
	// 0: the startup message, which has no type byte (its length comes first); S Sync, Q Query, X Terminate.
	return type === 0 || type === 0x53 || type === 0x51 || type === 0x58;
}

/**
 * Replaces the message queue of a PGLiteSocketServer (before start()) by one that never mixes two connections.
 * @param {import('@electric-sql/pglite-socket').PGLiteSocketServer} server
 */
export function serializeBatches(server) {
	// The queue is not part of the package's interface: check its shape, so that an upgrade that changes it fails
	// here, loudly, instead of bringing the flaky failures back.
	const queue = /** @type {any} */ (server).queryQueue;
	if (
		!queue ||
		!Array.isArray(queue.queue) ||
		typeof queue.processing !== 'boolean' ||
		typeof queue.processQueue !== 'function' ||
		typeof queue.clearTransactionIfNeeded !== 'function' ||
		queue.db !== server.db
	) {
		throw new Error(
			'@electric-sql/pglite-socket changed its query queue: review e2e/pglite-batches.mjs (electric-sql/pglite#1046)'
		);
	}
	const db = server.db;
	/** The connection that holds the session, or null when the protocol is at rest. */
	let owner = null;

	queue.processQueue = async function () {
		if (this.processing) return;
		this.processing = true;
		try {
			while (this.queue.length > 0) {
				const i = owner === null ? 0 : this.queue.findIndex((q) => q.handlerId === owner);
				// The holder's next message has not arrived yet: the others wait, and its enqueue starts the loop again.
				if (i === -1) break;
				const [query] = this.queue.splice(i, 1);
				owner = query.handlerId;
				let size = 0;
				try {
					await db.runExclusive(() =>
						db.execProtocolRawStream(query.message, {
							onRawData: (data) => {
								size += data.length;
								query.onData(data);
							}
						})
					);
				} catch (error) {
					// The connection is closed after this (its handler detaches), which gives the session back.
					query.reject(error);
					continue;
				}
				if (owner === query.handlerId && atRest(query.message) && !db.isInTransaction()) owner = null;
				query.resolve(size);
			}
		} finally {
			this.processing = false;
		}
	};

	// Called when a connection goes away (after its queued messages were dropped).
	queue.clearTransactionIfNeeded = async function (handlerId) {
		if (owner !== handlerId) return;
		await db.runExclusive(async () => {
			// Its last message may have put the protocol at rest meanwhile, and another connection taken the session.
			if (owner !== handlerId) return;
			const ignore = { onRawData: () => {} };
			await db.execProtocolRawStream(SYNC, ignore);
			if (db.isInTransaction()) await db.execProtocolRawStream(ROLLBACK, ignore);
			owner = null;
		});
		await this.processQueue();
	};
}
