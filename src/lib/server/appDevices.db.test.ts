// The bells of the Android app (appDevices.ts) against a real schema: every migration applied to PostgreSQL with
// PostGIS (PGlite, in memory, reached through the PostgreSQL protocol like the site does), then what a device keeps,
// how its places follow the app, what is sent to it, when it is forgotten, and the way back of 009.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$app/env/private', () => ({
	get VIGIE_FCM_SERVICE_ACCOUNT() {
		return env.VIGIE_FCM_SERVICE_ACCOUNT;
	},
	get VIGIE_FCM_BASE_URL() {
		return env.VIGIE_FCM_BASE_URL;
	}
}));

const {
	AppDeviceError,
	bearer,
	deviceBySecret,
	listAppPlaces,
	parseAppDevice,
	registerAppDevice,
	removeAppDevice,
	sendToDevice,
	updateAppDevice
} = await import('./appDevices');
const { cleanUp } = await import('./accounts');
const { resetFcm } = await import('./fcm');
const { MAX_ZONES } = await import('../zones');

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
/** A registration token as FCM gives them; `mark` lands in it (the fake FCM below reads it). */
const token = (mark = 'ok') => `${mark}${++serial}:APA91b${'x'.repeat(140)}`;
// Lorient and Corte, never a real person's place.
const lorient = { name: 'Lorient', lat: 47.7483, lon: -3.3702 };
const corte = { name: 'Corte', lat: 42.3061, lon: 9.1503, radiusKm: 25, minLevel: 'RED' };
const device = (places: unknown[], extra: Record<string, unknown> = {}) => {
	const parsed = parseAppDevice({ token: token(), places, ...extra });
	if (parsed instanceof AppDeviceError) throw parsed;
	return parsed;
};
const idOf = async (secret: string) => (await deviceBySecret(sql, secret))!.id;
const zonesOf = (id: string) =>
	sql<{ id: string; name: string; baseline_done: boolean; kinds: string[]; has_geom: boolean }[]>`
		select id, name, baseline_done, kinds, geom is not null as has_geom from zones
		where device_id = ${id} order by name`;

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

describe('what the app sends', () => {
	it('is checked: a token, at most MAX_ZONES places with a name, a point, a known radius and level', () => {
		const ok = { token: token(), places: [lorient] };
		expect(parseAppDevice(ok)).toMatchObject({ lang: 'fr', timeZone: null, quietHours: false });
		const code = (body: unknown) => (parseAppDevice(body) as InstanceType<typeof AppDeviceError>).code;
		expect(code(null)).toBe('body');
		expect(code({ ...ok, token: 'short' })).toBe('token');
		expect(code({ ...ok, places: 'Lorient' })).toBe('places');
		expect(code({ ...ok, places: [{ ...lorient, name: '' }] })).toBe('places');
		expect(code({ ...ok, places: [{ ...lorient, lat: 91 }] })).toBe('places');
		expect(code({ ...ok, places: [{ ...lorient, lat: '47.7' }] })).toBe('places');
		expect(code({ ...ok, places: [{ ...lorient, radiusKm: 7 }] })).toBe('places');
		expect(code({ ...ok, places: [{ ...lorient, minLevel: 'GREEN' }] })).toBe('places');
		const many = Array.from({ length: MAX_ZONES + 1 }, (_, i) => ({ ...lorient, lat: 40 + i }));
		expect(code({ ...ok, places: many })).toBe('places');
	});

	it('keeps a point to about 1 km, a radius of 10 km and every level by default, and one place per point', () => {
		const parsed = device([lorient, { ...lorient, name: 'Lorient again', lat: 47.749 }], {
			lang: 'en',
			timeZone: 'Europe/Paris',
			quietHours: true
		});
		expect(parsed).toMatchObject({ lang: 'en', timeZone: 'Europe/Paris', quietHours: true });
		expect(parsed.places).toEqual([
			{ name: 'Lorient', lat: 47.75, lon: -3.37, radiusKm: 10, minLevel: 'YELLOW' }
		]);
		expect(device([], { timeZone: 'Mars/Olympus' }).timeZone).toBeNull();
	});

	it('names the device by a bearer secret of 43 characters, and nothing else', () => {
		const secret = 'a'.repeat(43);
		expect(bearer(`Bearer ${secret}`)).toBe(secret);
		expect(bearer(secret)).toBeNull();
		expect(bearer(`Bearer ${secret}x`)).toBeNull();
		expect(bearer(null)).toBeNull();
	});
});

describe('a device and its places', () => {
	it('registers with its places as circle zones of the device, its secret kept as a fingerprint only', async () => {
		const secret = await registerAppDevice(sql, device([lorient, corte]), 100);
		expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const id = await idOf(secret);
		const [row] = await sql`
			select row_to_json(d)::text as json, encode(secret_hash, 'hex') as hash from app_devices d where id = ${id}`;
		expect(row.hash).toBe(createHash('sha256').update(secret).digest('hex'));
		expect(row.json).not.toContain(secret);
		const zones = await zonesOf(id);
		expect(zones.map((z) => z.name)).toEqual(['Corte', 'Lorient']);
		expect(zones.every((z) => z.has_geom && !z.baseline_done)).toBe(true);
		expect(zones[0].kinds).toContain('VIGILANCE');
		expect(zones[0].kinds).not.toContain('SOLAR_STORM');
		// The surface is where the place is: Corte's covers the town, not Lorient.
		const [inside] = await sql<{ near: boolean; far: boolean }[]>`
			select ST_Covers(geom, ST_SetSRID(ST_MakePoint(9.15, 42.31), 4326)::geography) as near,
				ST_Covers(geom, ST_SetSRID(ST_MakePoint(-3.37, 47.75), 4326)::geography) as far
			from zones where id = ${zones[0].id}`;
		expect(inside).toEqual({ near: true, far: false });
		expect(await listAppPlaces(sql, id)).toEqual([
			{ name: 'Corte', lat: 42.31, lon: 9.15, radiusKm: 25, minLevel: 'RED' },
			{ name: 'Lorient', lat: 47.75, lon: -3.37, radiusKm: 10, minLevel: 'YELLOW' }
		]);
	});

	it('follows the app: a place kept keeps its zone and baseline, a moved one is compared again, a gone one goes', async () => {
		const first = device([lorient, corte]);
		const secret = await registerAppDevice(sql, first, 100);
		const id = await idOf(secret);
		const [corteZone, lorientZone] = await zonesOf(id);
		await sql`update zones set baseline_done = true where device_id = ${id}`;

		// Lorient renamed, Corte gone, a new place; and a new token.
		const next = device([
			{ ...lorient, name: 'Port de Lorient' },
			{ name: 'Bastia', lat: 42.7, lon: 9.45 }
		]);
		expect(await updateAppDevice(sql, secret, next)).toBe(true);
		const zones = await zonesOf(id);
		expect(zones.map((z) => [z.name, z.baseline_done])).toEqual([
			['Bastia', false],
			['Port de Lorient', true]
		]);
		expect(zones[1].id).toBe(lorientZone.id);
		expect(zones.map((z) => z.id)).not.toContain(corteZone.id);
		const [{ fcm_token }] = await sql`select fcm_token from app_devices where id = ${id}`;
		expect(fcm_token).toBe(next.token);

		// A level changed is a new zone: what is in force at the new level is not news.
		await updateAppDevice(sql, secret, device([{ ...lorient, name: 'Port de Lorient', minLevel: 'ORANGE' }]));
		const [orange] = await zonesOf(id);
		expect(orange.id).not.toBe(lorientZone.id);
		expect(orange.baseline_done).toBe(false);

		// No place: no zone, the device stays.
		await updateAppDevice(sql, secret, device([]));
		expect(await zonesOf(id)).toEqual([]);
		expect(await deviceBySecret(sql, secret)).not.toBeNull();
	});

	it('refuses an unknown secret, and the same token registered again replaces the device it was', async () => {
		expect(await updateAppDevice(sql, 'b'.repeat(43), device([]))).toBe(false);
		expect(await removeAppDevice(sql, 'b'.repeat(43))).toBe(false);
		const input = device([lorient]);
		const before = await registerAppDevice(sql, input, 100);
		const oldId = await idOf(before);
		const after = await registerAppDevice(sql, input, 100);
		expect(await deviceBySecret(sql, before)).toBeNull();
		expect(await zonesOf(oldId)).toEqual([]);
		expect(await listAppPlaces(sql, await idOf(after))).toHaveLength(1);
		// A token moved to another device by an update leaves the older row too.
		const other = await registerAppDevice(sql, device([]), 100);
		await updateAppDevice(sql, other, { ...device([]), token: input.token });
		expect(await deviceBySecret(sql, after)).toBeNull();
	});

	it('stops at the ceiling of devices without half doing it', async () => {
		const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from app_devices`;
		const input = device([lorient]);
		await expect(registerAppDevice(sql, input, n)).rejects.toMatchObject({ code: 'full' });
		const [{ m }] = await sql<{ m: number }[]>`select count(*)::int as m from app_devices`;
		expect(m).toBe(n);
		const [{ z }] = await sql<
			{ z: number }[]
		>`select count(*)::int as z from app_devices where fcm_token = ${input.token}`;
		expect(z).toBe(0);
	});

	it('is forgotten with its places and history when removed, or silent for 60 days', async () => {
		const removed = await registerAppDevice(sql, device([lorient]), 100);
		const removedId = await idOf(removed);
		const [zone] = await zonesOf(removedId);
		await sql`
			insert into zone_alerts (device_id, zone_id, alert_key, kind, level, title, url, outcome)
			values (${removedId}, ${zone.id}, 'w:FR:1', 'VIGILANCE', 'RED', 'Rouge', '/', 'sent')`;
		expect(await removeAppDevice(sql, removed)).toBe(true);
		const [left] = await sql<{ zones: number; alerts: number }[]>`
			select (select count(*) from zones where device_id = ${removedId})::int as zones,
				(select count(*) from zone_alerts where device_id = ${removedId})::int as alerts`;
		expect(left).toEqual({ zones: 0, alerts: 0 });

		const silent = await registerAppDevice(sql, device([lorient]), 100);
		const seen = await registerAppDevice(sql, device([lorient]), 100);
		const silentId = await idOf(silent);
		await sql`update app_devices set seen_at = now() - interval '61 days' where id = ${silentId}`;
		await cleanUp(sql);
		const [{ n }] = await sql<
			{ n: number }[]
		>`select count(*)::int as n from app_devices where id = ${silentId}`;
		expect(n).toBe(0);
		expect(await zonesOf(silentId)).toEqual([]);
		expect(await deviceBySecret(sql, seen)).not.toBeNull();
	});

	it('keeps a zone to one owner, an account or a device, never both or none', async () => {
		const secret = await registerAppDevice(sql, device([]), 100);
		const id = await idOf(secret);
		const [{ uid }] = await sql<{ uid: string }[]>`
			insert into users (id, name) values (gen_random_uuid(), 'owner') returning id as uid`;
		const zone = (user: string | null, dev: string | null) =>
			sql`insert into zones (id, user_id, device_id, name, kind, country, kinds)
				values (gen_random_uuid(), ${user}, ${dev}, 'Z', 'country', 'FR', '{VIGILANCE}')`;
		await expect(zone(uid, id)).rejects.toThrow();
		await expect(zone(null, null)).rejects.toThrow();
		await zone(uid, null);
		await zone(null, id);
	});
});

describe('what is sent to a device', () => {
	const SA_URI = 'https://oauth2.example.org/token';
	const sends: { url: string; body: string }[] = [];

	function useFcm(
		answer: (token: string) => Response,
		tokenAnswer = () => Response.json({ access_token: 'ya29.test', expires_in: 3599 })
	) {
		const dir = mkdtempSync(join(tmpdir(), 'vigie-app-'));
		const path = join(dir, 'sa.json');
		writeFileSync(
			path,
			JSON.stringify({
				type: 'service_account',
				project_id: 'vigie-test',
				client_email: 'push@vigie-test.iam.gserviceaccount.com',
				private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
					.privateKey.export({ type: 'pkcs8', format: 'pem' })
					.toString(),
				token_uri: SA_URI
			})
		);
		env.VIGIE_FCM_SERVICE_ACCOUNT = path;
		env.VIGIE_FCM_BASE_URL = 'https://fcm.example.org';
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL, init: RequestInit = {}) => {
				if (String(url) === SA_URI) return tokenAnswer();
				const body = String(init.body);
				sends.push({ url: String(url), body });
				return answer(JSON.parse(body).message.token as string);
			})
		);
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		delete env.VIGIE_FCM_SERVICE_ACCOUNT;
		delete env.VIGIE_FCM_BASE_URL;
		resetFcm();
		sends.length = 0;
	});

	const message = {
		title: 'Rouge · Vent violent',
		body: 'Corte',
		url: '/warning/fr/1',
		tag: 'w:FR:1',
		level: 'RED' as const
	};

	it('is nothing when FCM is off', async () => {
		const id = await idOf(await registerAppDevice(sql, device([corte]), 100));
		expect(await sendToDevice(sql, id, message)).toBeNull();
	});

	it('goes to the device’s token on the red channel, and marks it sent', async () => {
		useFcm(() => Response.json({ name: 'projects/vigie-test/messages/1' }));
		const input = device([corte]);
		const id = await idOf(await registerAppDevice(sql, input, 100));
		expect(await sendToDevice(sql, id, message)).toEqual({ sent: 1, failed: 0 });
		expect(sends).toHaveLength(1);
		const sent = JSON.parse(sends[0].body).message;
		expect(sent.token).toBe(input.token);
		expect(sent.android.notification).toEqual({ tag: 'w:FR:1', channel_id: 'vigie-red' });
		const [row] = await sql`select last_sent_at, failures from app_devices where id = ${id}`;
		expect(row.last_sent_at).not.toBeNull();
		expect(row.failures).toBe(0);
	});

	it('forgets a token FCM no longer knows, and a device failing five times in a row', async () => {
		useFcm((t) =>
			t.startsWith('gone')
				? Response.json(
						{ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
						{ status: 404 }
					)
				: new Response(null, { status: 500 })
		);
		const gone = parseAppDevice({ token: token('gone'), places: [corte] });
		if (gone instanceof AppDeviceError) throw gone;
		const goneId = await idOf(await registerAppDevice(sql, gone, 100));
		expect(await sendToDevice(sql, goneId, message)).toEqual({ sent: 0, failed: 1 });
		expect(await zonesOf(goneId)).toEqual([]);

		const flaky = await registerAppDevice(sql, device([corte]), 100);
		const flakyId = await idOf(flaky);
		for (let i = 0; i < 4; i++) await sendToDevice(sql, flakyId, message);
		expect(await deviceBySecret(sql, flaky)).not.toBeNull();
		await sendToDevice(sql, flakyId, message);
		expect(await deviceBySecret(sql, flaky)).toBeNull();
	});

	it('does not blame the device for the server’s own fault (no access token)', async () => {
		useFcm(
			() => Response.json({}),
			() => new Response(null, { status: 500 })
		);
		const secret = await registerAppDevice(sql, device([corte]), 100);
		const id = await idOf(secret);
		for (let i = 0; i < 6; i++) expect(await sendToDevice(sql, id, message)).toEqual({ sent: 0, failed: 1 });
		const [row] = await sql`select failures from app_devices where id = ${id}`;
		expect(row.failures).toBe(0);
	});
});

describe('the way back of 009', () => {
	it('drops the devices and their zones, keeps the zones of the accounts, and the migration applies again', async () => {
		const [{ uid }] = await sql<{ uid: string }[]>`
			insert into users (id, name) values (gen_random_uuid(), 'stays') returning id as uid`;
		await sql`insert into zones (id, user_id, name, kind, country, kinds)
			values (gen_random_uuid(), ${uid}, 'France', 'country', 'FR', '{VIGILANCE}')`;
		await registerAppDevice(sql, device([lorient]), 100);

		await sql.unsafe(read('down', '009_app_devices.down.sql'));
		expect(await sql`select 1 from information_schema.tables where table_name = 'app_devices'`).toHaveLength(
			0
		);
		expect(
			await sql`select 1 from information_schema.columns where table_name in ('zones', 'zone_alerts') and column_name = 'device_id'`
		).toHaveLength(0);
		expect(await sql`select 1 from schema_migrations where id = '009_app_devices'`).toHaveLength(0);
		const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from zones where user_id = ${uid}`;
		expect(n).toBe(1);
		await expect(
			sql`insert into zones (id, name, kind, country, kinds) values (gen_random_uuid(), 'Z', 'country', 'FR', '{VIGILANCE}')`
		).rejects.toThrow();

		await sql.unsafe(read('009_app_devices.sql'));
		expect(await sql`select 1 from information_schema.tables where table_name = 'app_devices'`).toHaveLength(
			1
		);
	});
});
