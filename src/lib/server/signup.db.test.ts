// Open sign-up and recovery codes against a real schema: every migration applied to PostgreSQL (PGlite, in memory,
// reached through the PostgreSQL protocol like the site does), then the settings, the three limits, the options of
// a passkey for a new account, the codes (shown once, kept as a fingerprint, spent once) and the way back of 007.
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanUp, deleteUser, exportUser, readInvitation } from './accounts';
import { PasskeyError, register, registrationOptions, type OpenSignup } from './passkeys';
import {
	makeRecoveryCodes,
	normalizeCode,
	RECOVERY_CODES,
	recoveryStatus,
	showCode,
	useRecoveryCode
} from './recovery';
import {
	AddressLimits,
	claimSignup,
	DEFAULT_MAX_ACCOUNTS,
	DEFAULT_SIGNUPS_PER_DAY,
	signupConfig,
	signupStatus,
	type SignupConfig
} from './signup';

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

async function user(name: string, createdAgo = '0 seconds'): Promise<string> {
	const [row] = await sql<{ id: string }[]>`
		insert into users (id, name, created_at) values (gen_random_uuid(), ${name}, now() - ${createdAgo}::interval)
		returning id`;
	return row.id;
}

const open = (over: Partial<SignupConfig> = {}): SignupConfig => ({
	mode: 'open',
	maxAccounts: 100_000,
	perDay: 100_000,
	...over
});
const signupOf = (config: SignupConfig, tries = true, makes = true): OpenSignup => ({
	config,
	tryAllowed: () => tries,
	makeAllowed: () => makes
});
const url = new URL('http://localhost');

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

describe('the sign-up settings', () => {
	it('keep the invitations unless the site is told "open", with ceilings that have a default', () => {
		expect(signupConfig({})).toEqual({
			mode: 'invitation',
			maxAccounts: DEFAULT_MAX_ACCOUNTS,
			perDay: DEFAULT_SIGNUPS_PER_DAY
		});
		expect(signupConfig({ mode: 'open' }).mode).toBe('open');
		expect(signupConfig({ mode: ' OPEN ' }).mode).toBe('open');
		for (const mode of ['yes', 'true', '1', 'opened', '', undefined, null])
			expect(signupConfig({ mode }).mode).toBe('invitation');
	});

	it('read the ceilings as whole numbers, 0 included, and fall back on the default otherwise', () => {
		expect(signupConfig({ maxAccounts: '25', perDay: '3' })).toMatchObject({ maxAccounts: 25, perDay: 3 });
		expect(signupConfig({ maxAccounts: '0', perDay: '0' })).toMatchObject({ maxAccounts: 0, perDay: 0 });
		for (const bad of ['abc', '-3', '5.5', '', '  ', 'Infinity'])
			expect(signupConfig({ maxAccounts: bad, perDay: bad })).toMatchObject({
				maxAccounts: DEFAULT_MAX_ACCOUNTS,
				perDay: DEFAULT_SIGNUPS_PER_DAY
			});
	});
});

describe('who may open an account without an invitation', () => {
	it('is nobody when the site keeps its invitations', async () => {
		expect(await signupStatus(sql, signupConfig({}))).toBe('invitation');
	});

	it('is anyone when the site is open and there is room', async () => {
		expect(await signupStatus(sql, open())).toBe('open');
	});

	it('stops at the ceiling of accounts, whatever their age or the way they were made', async () => {
		await user('old-1', '40 days');
		await user('old-2', '41 days');
		const total = Number((await sql`select count(*) as n from users`)[0].n);
		expect(await signupStatus(sql, open({ maxAccounts: total + 1 }))).toBe('open');
		expect(await signupStatus(sql, open({ maxAccounts: total }))).toBe('full');
		expect(await signupStatus(sql, open({ maxAccounts: 0 }))).toBe('full');
	});

	it('stops at the ceiling of the last 24 hours, and an old account does not count in it', async () => {
		const recent = Number(
			(await sql`select count(*) as n from users where created_at > now() - interval '24 hours'`)[0].n
		);
		expect(await signupStatus(sql, open({ perDay: recent + 1 }))).toBe('open');
		await user('today');
		expect(await signupStatus(sql, open({ perDay: recent + 1 }))).toBe('full');
		expect(await signupStatus(sql, open({ perDay: 0 }))).toBe('full');
	});

	it('is decided again inside the transaction that makes the account', async () => {
		const total = Number((await sql`select count(*) as n from users`)[0].n);
		const answers = await sql.begin(async (tx) => [
			await claimSignup(tx, open({ maxAccounts: total + 1 })),
			await claimSignup(tx, open({ maxAccounts: total })),
			await claimSignup(tx, signupConfig({}))
		]);
		expect(answers).toEqual(['open', 'full', 'invitation']);
	});
});

describe('the share of tries of an address', () => {
	it('lets an address through up to its share, then refuses until the window moves', () => {
		let now = 0;
		const limits = new AddressLimits(2, 1000, () => now);
		expect(limits.take('a')).toBe(true);
		expect(limits.take('a')).toBe(true);
		expect(limits.take('a')).toBe(false);
		expect(limits.take('b')).toBe(true);
		now = 1001;
		expect(limits.take('a')).toBe(true);
	});
});

describe('the options of a passkey for a new account, without an invitation', () => {
	const ask = (signup: OpenSignup | undefined, name: string | null = 'Marie') =>
		registrationOptions(sql, url, { name, lang: 'fr', user: null, signup });
	const code = async (promise: Promise<unknown>) =>
		promise.then(
			() => 'ok',
			(e) => (e instanceof PasskeyError ? e.code : String(e))
		);

	it('are refused to someone with nothing to show, and where the site keeps its invitations', async () => {
		expect(await code(ask(undefined))).toBe('refused');
		expect(await code(ask(signupOf(signupConfig({}))))).toBe('closed');
	});

	it('are refused when the site is full, when the address has used its tries, or without a name', async () => {
		expect(await code(ask(signupOf(open({ maxAccounts: 0 }))))).toBe('full');
		expect(await code(ask(signupOf(open(), false)))).toBe('slow');
		expect(await code(ask(signupOf(open()), null))).toBe('name');
	});

	it('are given on an open site: a challenge for a new account that no invitation backs', async () => {
		const before = Number((await sql`select count(*) as n from challenges`)[0].n);
		const { id, options } = await ask(signupOf(open()), 'Marie');
		expect(options.user.name).toBe('Marie');
		const [row] = await sql<
			{ kind: string; invitation_hash: Buffer | null; name: string; new_user_id: string }[]
		>`
			select kind, invitation_hash, name, new_user_id from challenges where id = ${id}`;
		expect(row).toMatchObject({ kind: 'register', invitation_hash: null, name: 'Marie' });
		expect(row.new_user_id).toBeTruthy();
		expect(Number((await sql`select count(*) as n from challenges`)[0].n)).toBe(before + 1);
	});

	it('cannot be finished by a request that does not carry the settings, or by an address out of tries', async () => {
		const { id } = await ask(signupOf(open()), 'Marie');
		const response = { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} };
		await expect(register(sql, url, id, response as never, null)).rejects.toMatchObject({ code: 'refused' });
		const second = await ask(signupOf(open()), 'Marie');
		await expect(
			register(sql, url, second.id, response as never, null, signupOf(open(), true, false))
		).rejects.toMatchObject({ code: 'slow' });
		// A challenge is taken once, whatever happens next.
		await expect(
			register(sql, url, second.id, response as never, null, signupOf(open()))
		).rejects.toMatchObject({ code: 'expired' });
	});
});

describe('the recovery codes', () => {
	it('are written in a way that is hard to misread, and read back whatever the case, spaces or hyphens', () => {
		expect(showCode('0123456789ABCDEFGHJK')).toBe('01234-56789-ABCDE-FGHJK');
		expect(normalizeCode('01234-56789-abcde-fghjk')).toBe('0123456789ABCDEFGHJK');
		expect(normalizeCode(' 01234 56789 ABCDE FGHJK ')).toBe('0123456789ABCDEFGHJK');
		// O is read as 0, I and L as 1.
		expect(normalizeCode('O1234-56789-ABCDE-FGHJK')).toBe('01234' + '56789ABCDEFGHJK');
		expect(normalizeCode('0I234-56789-ABCDE-FGHJK')).toBe('0123456789ABCDEFGHJK');
		expect(normalizeCode('0L234-56789-ABCDE-FGHJK')).toBe('0123456789ABCDEFGHJK');
		for (const bad of [
			'',
			'short',
			'01234-56789-ABCDE-FGHJ',
			'01234-56789-ABCDE-FGHJKM',
			'U'.repeat(20),
			42,
			null
		])
			expect(normalizeCode(bad)).toBeNull();
	});

	it('come as a set of 8, of 100 bits each, shown once, kept as a fingerprint only', async () => {
		const u = await user('codes-set');
		const codes = await makeRecoveryCodes(sql, u);
		expect(codes).toHaveLength(RECOVERY_CODES);
		expect(new Set(codes).size).toBe(RECOVERY_CODES);
		for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
		const rows = await sql<
			{ code_hash: Buffer }[]
		>`select code_hash from recovery_codes where user_id = ${u}`;
		expect(rows).toHaveLength(RECOVERY_CODES);
		for (const r of rows) expect(r.code_hash).toHaveLength(32);
		expect(await recoveryStatus(sql, u)).toEqual({ remaining: RECOVERY_CODES, total: RECOVERY_CODES });
	});

	it('are replaced by a new set, and one account never touches the codes of another', async () => {
		const a = await user('codes-a');
		const b = await user('codes-b');
		const oldA = await makeRecoveryCodes(sql, a);
		const codesB = await makeRecoveryCodes(sql, b);
		const newA = await makeRecoveryCodes(sql, a);
		expect(await recoveryStatus(sql, a)).toEqual({ remaining: RECOVERY_CODES, total: RECOVERY_CODES });
		expect(await useRecoveryCode(sql, oldA[0])).toBeNull();
		expect(await useRecoveryCode(sql, newA[0])).not.toBeNull();
		expect(await recoveryStatus(sql, b)).toEqual({ remaining: RECOVERY_CODES, total: RECOVERY_CODES });
		expect(await useRecoveryCode(sql, codesB[0])).not.toBeNull();
	});

	it('work once: a good code gives a 30-minute invitation to add a passkey to its account', async () => {
		const u = await user('codes-use');
		const codes = await makeRecoveryCodes(sql, u);
		const typed = codes[2].toLowerCase().replaceAll('-', ' ');
		const invitation = await useRecoveryCode(sql, typed);
		expect(invitation).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
		const read = await readInvitation(sql, invitation!);
		expect(read?.forUser?.id).toBe(u);
		const minutes = (read!.expiresAt.getTime() - Date.now()) / 60_000;
		expect(minutes).toBeGreaterThan(28);
		expect(minutes).toBeLessThanOrEqual(30);
		expect(await recoveryStatus(sql, u)).toEqual({ remaining: RECOVERY_CODES - 1, total: RECOVERY_CODES });
		// The same code, another day: the same answer as a wrong one.
		expect(await useRecoveryCode(sql, codes[2])).toBeNull();
		// The other codes of the set still work.
		expect(await useRecoveryCode(sql, codes[3])).not.toBeNull();
	});

	it('say the same thing to a wrong code, a used one and a badly written one', async () => {
		const u = await user('codes-wrong');
		const [good] = await makeRecoveryCodes(sql, u);
		expect(await useRecoveryCode(sql, '0'.repeat(20))).toBeNull();
		expect(await useRecoveryCode(sql, 'not a code')).toBeNull();
		expect(await useRecoveryCode(sql, undefined)).toBeNull();
		expect(await useRecoveryCode(sql, good)).not.toBeNull();
		expect(await useRecoveryCode(sql, good)).toBeNull();
	});

	it('are in the export as dates only, and leave with the account', async () => {
		const u = await user('codes-export');
		const codes = await makeRecoveryCodes(sql, u);
		await useRecoveryCode(sql, codes[0]);
		const exported = await exportUser(sql, u);
		const list = exported.recovery_codes as { created_at: Date; used_at: Date | null; note: string }[];
		expect(list).toHaveLength(RECOVERY_CODES);
		expect(list.filter((c) => c.used_at)).toHaveLength(1);
		const text = JSON.stringify(exported);
		for (const c of codes) expect(text).not.toContain(c.replaceAll('-', ''));
		await deleteUser(sql, u);
		expect((await sql`select count(*) as n from recovery_codes where user_id = ${u}`)[0].n).toBe('0');
	});

	it('are forgotten 30 days after they were used, the unused ones not', async () => {
		const u = await user('codes-clean');
		const codes = await makeRecoveryCodes(sql, u);
		await useRecoveryCode(sql, codes[0]);
		await useRecoveryCode(sql, codes[1]);
		await sql`update recovery_codes set used_at = now() - interval '31 days'
			where user_id = ${u} and used_at is not null and code_hash = (
				select code_hash from recovery_codes where user_id = ${u} and used_at is not null order by code_hash limit 1)`;
		await cleanUp(sql);
		expect(await recoveryStatus(sql, u)).toEqual({
			remaining: RECOVERY_CODES - 2,
			total: RECOVERY_CODES - 1
		});
	});
});

describe('the way back of 007', () => {
	it('is kept out of the loader, drops the table, and the migration can be applied again', async () => {
		const loader = readFileSync(join(import.meta.dirname, 'db.ts'), 'utf-8');
		expect(loader).not.toContain('down/');
		expect(readdirSync(join(MIGRATIONS, 'down'))).toContain('007_recovery_codes.down.sql');
		await sql.unsafe(read('down', '007_recovery_codes.down.sql'));
		expect((await sql`select to_regclass('recovery_codes') as t`)[0].t).toBeNull();
		expect(await sql`select id from schema_migrations where id = '007_recovery_codes'`).toHaveLength(0);
		await sql.unsafe(read('007_recovery_codes.sql'));
		expect((await sql`select to_regclass('recovery_codes') as t`)[0].t).not.toBeNull();
	});
});
