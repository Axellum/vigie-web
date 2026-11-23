// The Android app linked to an account by a code (appLinks.ts) against a real schema: every migration applied to
// PostgreSQL with PostGIS (PGlite, in memory, reached through the PostgreSQL protocol like the site does), then the
// code asked, entered and picked up, what the linked phone reads and changes, and the way back of 010.
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	VIGIE_FCM_SERVICE_ACCOUNT: undefined,
	VIGIE_FCM_BASE_URL: undefined
}));

const {
	AppLinkError,
	claimAppLink,
	linkedAccount,
	linkedPhone,
	pollAppLink,
	startAppLink,
	unlinkPhone,
	updateLinkedToken
} = await import('./appLinks');
const { cleanUp, digest } = await import('./accounts');
const { decryptToken, encryptToken } = await import('./tvPairing');

const MIGRATIONS = join(import.meta.dirname, 'migrations');
const files = readdirSync(MIGRATIONS)
	.filter((f) => f.endsWith('.sql'))
	.sort();
const read = (...p: string[]) => readFileSync(join(MIGRATIONS, ...p), 'utf-8');

let pg: PGlite;
let server: PGLiteSocketServer;
let sql: postgres.Sql;

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

let serial = 0;
/** A registration token as FCM gives them. */
const token = () => `link${++serial}:APA91b${'x'.repeat(140)}`;
const user = async (name: string) => {
	const [{ id }] = await sql<{ id: string }[]>`
		insert into users (id, name) values (gen_random_uuid(), ${name}) returning id`;
	return id;
};
/** A code entered as a person may type it: lower case, a space, O for 0, I or L for 1. */
const typed = (code: string) => ` ${code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l')} `;
/** Asks a code, enters it for `userId`, picks up the secret. */
async function link(userId: string, phoneToken = token()) {
	const start = await startAppLink(sql, phoneToken);
	await claimAppLink(sql, userId, start.code);
	const poll = await pollAppLink(sql, start.wait, start.code);
	if (poll.status !== 'ready') throw new Error(`not ready: ${poll.status}`);
	return { secret: poll.secret, token: phoneToken };
}

beforeAll(async () => {
	pg = await PGlite.create({ extensions: { postgis } });
	const port = await freePort();
	server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 4 });
	await server.start();
	sql = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
	await sql.unsafe(
		'create table schema_migrations (id text primary key, applied_at timestamptz default now())'
	);
	for (const f of files) {
		await sql.unsafe(read(f));
		await sql.unsafe('insert into schema_migrations (id) values ($1)', [f.replace(/\.sql$/, '')]);
	}
}, 120_000);

afterAll(async () => {
	await sql?.end({ timeout: 2 });
	await server?.stop();
	await pg?.close();
});

describe('a code for the app', () => {
	it('is 8 characters shown XXXX-XXXX with a waiting token, and only their fingerprints are kept', async () => {
		await expect(startAppLink(sql, 'short')).rejects.toBeInstanceOf(AppLinkError);
		const phone = token();
		const start = await startAppLink(sql, phone);
		expect(start.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
		expect(start.wait).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(start.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
		const rows = await sql<{ wait_hash: Buffer; code_hash: Buffer; secret_cipher: string | null }[]>`
			select wait_hash, code_hash, secret_cipher from app_link_codes where fcm_token = ${phone}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].code_hash.equals(digest(start.code.replace('-', '')))).toBe(true);
		expect(rows[0].wait_hash.equals(digest(start.wait))).toBe(true);
		expect(rows[0].secret_cipher).toBeNull();
	});

	it('replaces the code the same phone asked before', async () => {
		const phone = token();
		const first = await startAppLink(sql, phone);
		const second = await startAppLink(sql, phone);
		expect(await pollAppLink(sql, first.wait, first.code)).toEqual({ status: 'expired' });
		expect(await pollAppLink(sql, second.wait, second.code)).toEqual({ status: 'pending' });
	});
});

describe('entering the code on the account page', () => {
	it('makes the phone a device of the account, and gives the app its secret once', async () => {
		const uid = await user('Mon compte');
		const phone = token();
		const start = await startAppLink(sql, phone);
		expect(await pollAppLink(sql, start.wait, start.code)).toEqual({ status: 'pending' });
		await claimAppLink(sql, uid, typed(start.code));

		const [row] = await sql<{ user_id: string; app_secret_hash: Buffer; endpoint: string | null }[]>`
			select user_id, app_secret_hash, endpoint from push_subscriptions where fcm_token = ${phone}`;
		expect(row.user_id).toBe(uid);
		expect(row.endpoint).toBeNull();

		// The secret waits encrypted with the code, for the app alone.
		const [code] = await sql<{ secret_cipher: string }[]>`
			select secret_cipher from app_link_codes where fcm_token = ${phone}`;
		const raw = start.code.replace('-', '');
		expect(decryptToken(raw, code.secret_cipher)).toBeNull();
		expect(decryptToken(raw, code.secret_cipher, 'vigie-app-link')).toMatch(/^[A-Za-z0-9_-]{43}$/);

		const ready = await pollAppLink(sql, start.wait, start.code);
		expect(ready.status).toBe('ready');
		const secret = (ready as { secret: string }).secret;
		expect(row.app_secret_hash.equals(digest(secret))).toBe(true);
		expect(await pollAppLink(sql, start.wait, start.code)).toEqual({ status: 'expired' });
		expect(await linkedPhone(sql, secret)).toMatchObject({ userId: uid, token: phone, lang: 'fr' });
	});

	it('refuses a code unknown, used, expired, or polled with another waiting token', async () => {
		const uid = await user('Refus');
		await expect(claimAppLink(sql, uid, 'ZZZZ-ZZZZ')).rejects.toBeInstanceOf(AppLinkError);
		await expect(claimAppLink(sql, uid, 'abc')).rejects.toBeInstanceOf(AppLinkError);
		await expect(claimAppLink(sql, uid, 42)).rejects.toBeInstanceOf(AppLinkError);

		const start = await startAppLink(sql, token());
		expect(await pollAppLink(sql, 'x'.repeat(43), start.code)).toEqual({ status: 'expired' });
		expect(await pollAppLink(sql, start.wait, 'ZZZZ-ZZZZ')).toEqual({ status: 'expired' });
		await claimAppLink(sql, uid, start.code);
		await expect(claimAppLink(sql, uid, start.code)).rejects.toBeInstanceOf(AppLinkError);

		const old = await startAppLink(sql, token(), -1000);
		await expect(claimAppLink(sql, uid, old.code)).rejects.toBeInstanceOf(AppLinkError);
		expect(await pollAppLink(sql, old.wait, old.code)).toEqual({ status: 'expired' });
	});

	it('moves a phone linked to another account, and keeps five devices at most', async () => {
		const first = await user('Premier');
		const second = await user('Second');
		const phone = await link(first);
		const again = await link(second, phone.token);
		expect(await linkedPhone(sql, phone.secret)).toBeNull();
		expect(await linkedPhone(sql, again.secret)).toMatchObject({ userId: second });

		for (let i = 0; i < 5; i++) await link(second);
		const [{ n }] = await sql<{ n: number }[]>`
			select count(*)::int as n from push_subscriptions where user_id = ${second}`;
		expect(n).toBe(5);
		expect(await linkedPhone(sql, again.secret)).toBeNull();
	});
});

describe('the linked phone', () => {
	it('reads the account’s name, quiet hours and zones', async () => {
		const uid = await user('Mes zones');
		await sql`update users set quiet_hours = true where id = ${uid}`;
		await sql`insert into zones (id, user_id, name, kind, country, kinds, min_level)
			values (gen_random_uuid(), ${uid}, 'Bretagne', 'country', 'FR', '{VIGILANCE}', 'ORANGE')`;
		const phone = await link(uid);
		const found = await linkedPhone(sql, phone.secret);
		expect(await linkedAccount(sql, found!.userId)).toEqual({
			name: 'Mes zones',
			quietHours: true,
			zones: [{ name: 'Bretagne', minLevel: 'ORANGE' }]
		});
	});

	it('gives a new token, and unlinks itself; an unknown secret changes nothing', async () => {
		const uid = await user('Jeton');
		const phone = await link(uid);
		const fresh = token();
		await expect(updateLinkedToken(sql, phone.secret, 'short')).rejects.toBeInstanceOf(AppLinkError);
		expect(await updateLinkedToken(sql, 'y'.repeat(43), fresh)).toBe(false);
		expect(await updateLinkedToken(sql, phone.secret, fresh)).toBe(true);
		expect(await linkedPhone(sql, phone.secret)).toMatchObject({ token: fresh });

		expect(await unlinkPhone(sql, phone.secret)).toBe(true);
		expect(await unlinkPhone(sql, phone.secret)).toBe(false);
		expect(await linkedPhone(sql, phone.secret)).toBeNull();
	});

	it('is unlinked when the device is removed on the site, or the account deleted', async () => {
		const uid = await user('Retrait');
		const phone = await link(uid);
		await sql`delete from push_subscriptions where user_id = ${uid}`;
		expect(await linkedPhone(sql, phone.secret)).toBeNull();
		const other = await link(uid);
		await sql`delete from users where id = ${uid}`;
		expect(await linkedPhone(sql, other.secret)).toBeNull();
	});

	it('keeps the codes of the app and of the screens apart', () => {
		const packed = encryptToken('ABCD2345', 'z'.repeat(43), 'vigie-app-link');
		expect(decryptToken('ABCD2345', packed)).toBeNull();
		expect(decryptToken('ABCD2346', packed, 'vigie-app-link')).toBeNull();
		expect(decryptToken('ABCD2345', packed, 'vigie-app-link')).toBe('z'.repeat(43));
	});

	it('loses its expired codes in the daily clean-up', async () => {
		const old = await startAppLink(sql, token(), -1000);
		const kept = await startAppLink(sql, token());
		await cleanUp(sql);
		const left =
			await sql`select 1 from app_link_codes where wait_hash in ${sql([digest(old.wait), digest(kept.wait)])}`;
		expect(left).toHaveLength(1);
	});
});

describe('the way back of 010', () => {
	it('drops the codes and the secrets, keeps the devices, and the migration applies again', async () => {
		const uid = await user('Reste');
		await link(uid);
		await startAppLink(sql, token());

		await sql.unsafe(read('down', '010_app_links.down.sql'));
		expect(
			await sql`select 1 from information_schema.tables where table_name = 'app_link_codes'`
		).toHaveLength(0);
		expect(
			await sql`select 1 from information_schema.columns where table_name = 'push_subscriptions' and column_name = 'app_secret_hash'`
		).toHaveLength(0);
		expect(await sql`select 1 from schema_migrations where id = '010_app_links'`).toHaveLength(0);
		const [{ n }] = await sql<{ n: number }[]>`
			select count(*)::int as n from push_subscriptions where user_id = ${uid}`;
		expect(n).toBe(1);

		await sql.unsafe(read('010_app_links.sql'));
		expect(
			await sql`select 1 from information_schema.tables where table_name = 'app_link_codes'`
		).toHaveLength(1);
	});
});
