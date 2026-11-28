// The test database itself (e2e/test-db.mjs): one PGlite session that the site's connection and the specs' share.
// Each test starts its own server on a free port, so nothing here touches the database of the other specs.
import { connect } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';
import { serializeBatches } from './pglite-batches.mjs';

async function startDb({ serialized = true } = {}) {
	const db = await PGlite.create();
	const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 16 });
	if (serialized) serializeBatches(server);
	await server.start();
	const url = `postgres://postgres@${server.getServerConn()}/postgres`;
	const clients: postgres.Sql[] = [];
	const client = () => {
		const sql = postgres(url, { max: 1, onnotice: () => {} });
		clients.push(sql);
		return sql;
	};
	const stop = async () => {
		await Promise.all(clients.map((sql) => sql.end({ timeout: 0 }).catch(() => {})));
		// The server hears of a closed socket a moment later, and its handler then reads the database: stop it first
		// (no handler listens after this), let those already told run, and only then close the database.
		await server.stop();
		await new Promise((resolve) => setImmediate(resolve));
		await db.close();
	};
	return { db, server, client, stop };
}

// The site (a transaction, then a query right after its commit) and a spec (polling), as in accounts.spec.ts.
async function siteAndSpec(site: postgres.Sql, spec: postgres.Sql, rounds: number) {
	await site`create table t (id int primary key, v text)`;
	await site`insert into t select g, 'v' || g from generate_series(1, 50) g`;
	const errors: string[] = [];
	let wrong = 0;
	for (let i = 0; i < rounds; i++) {
		const id = (i % 50) + 1;
		await Promise.all([
			(async () => {
				await site.begin(async (tx) => {
					await tx`select v from t where id = ${id}`;
					await tx`update t set v = ${'v' + id} where id = ${id}`;
				});
				const [r] = await site`select ${i}::int * 2 as doubled`;
				if (r?.doubled !== i * 2) wrong++;
			})().catch((e) => errors.push(e.message)),
			(async () => {
				for (let k = 0; k < 3; k++) {
					const [r] = await spec`select count(*)::int as n from t where id <= ${id}`;
					if (r?.n !== id) wrong++;
				}
			})().catch((e) => errors.push(e.message))
		]);
	}
	return { errors, wrong };
}

test('two connections, one of them in a transaction, never mix their messages in the one session', async () => {
	const { client, stop } = await startDb();
	try {
		expect(await siteAndSpec(client(), client(), 200)).toEqual({ errors: [], wrong: 0 });
	} finally {
		await stop();
	}
});

test('without serializeBatches, pglite-socket still mixes them (electric-sql/pglite#1046)', async () => {
	// When this fails, the upstream server keeps a connection's messages together: e2e/pglite-batches.mjs can go.
	const { client, stop } = await startDb({ serialized: false });
	try {
		const { errors } = await siteAndSpec(client(), client(), 50);
		expect(errors).toContain('portal "" does not exist');
	} finally {
		await stop();
	}
});

test('a connection that goes away inside a transaction gives the session back, rolled back', async () => {
	const { client, stop } = await startDb();
	try {
		const leaving = client();
		const other = client();
		await other`create table t (v text)`;
		let inside!: () => void;
		const entered = new Promise<void>((resolve) => (inside = resolve));
		const transaction = leaving
			.begin(async (tx) => {
				await tx`insert into t values (${'left behind'})`;
				inside();
				await new Promise(() => {});
			})
			.catch(() => {});
		await entered;
		const waiting = other`select count(*)::int as n from t`;
		await leaving.end({ timeout: 0 });
		await transaction;
		expect((await waiting)[0].n).toBe(0);
	} finally {
		await stop();
	}
});

test('a connection that goes away in the middle of its messages gives the session back, at rest', async () => {
	const { server, client, stop } = await startDb();
	try {
		const [host, port] = server.getServerConn().split(':');
		const frame = (type: string, body: Buffer) => {
			const length = Buffer.alloc(4);
			length.writeInt32BE(body.length + 4);
			return Buffer.concat([Buffer.from(type), length, body]);
		};
		const startup = Buffer.concat([
			Buffer.from([0, 3, 0, 0]),
			Buffer.from('user\0postgres\0database\0postgres\0\0')
		]);
		const length = Buffer.alloc(4);
		length.writeInt32BE(startup.length + 4);
		await new Promise<void>((resolve, reject) => {
			const socket = connect(Number(port), host);
			let step = 0;
			socket.on('error', reject);
			socket.on('close', () => resolve());
			socket.on('connect', () => socket.write(Buffer.concat([length, startup])));
			socket.on('data', (data) => {
				if (step === 0 && data.includes(0x5a)) {
					// Ready: a Parse that fails, with no Sync after it, so the session waits for one; then the socket goes.
					step = 1;
					socket.write(frame('P', Buffer.from('\0selec nothing\0\0\0')));
				} else if (step === 1) {
					step = 2;
					socket.destroy();
				}
			});
		});
		const sql = client();
		expect((await sql`select ${41}::int + 1 as n`)[0].n).toBe(42);
	} finally {
		await stop();
	}
});

test('an internal error of one connection does not stop the queue for the others', async () => {
	const { db, client, stop } = await startDb();
	const run = db.execProtocolRawStream.bind(db);
	db.execProtocolRawStream = async (message, options) => {
		if (Buffer.from(message).includes('boom')) throw new Error('an internal failure');
		return run(message, options);
	};
	try {
		await expect(client()`select ${'boom'}::text as v`).rejects.toThrow();
		expect((await client()`select ${41}::int + 1 as n`)[0].n).toBe(42);
	} finally {
		await stop();
	}
});
