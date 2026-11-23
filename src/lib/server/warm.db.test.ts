// The positions the warming reads (warm.ts `knownPlaces`) against a real schema: every migration applied to PostgreSQL with
// PostGIS (PGlite, as appDevices.db.test.ts does). Circle zones of accounts and of the app's devices, and the places of accounts;
// never a country, an area or a drawn polygon.
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({}));

const { knownPlaces, selectCells } = await import('./warm');

const MIGRATIONS = join(import.meta.dirname, 'migrations');
const files = readdirSync(MIGRATIONS)
	.filter((f) => f.endsWith('.sql'))
	.sort();

let pg: PGlite;
let server: PGLiteSocketServer;
let sql: postgres.Sql;

const freePort = () =>
	new Promise<number>((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});

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
		await sql.unsafe(readFileSync(join(MIGRATIONS, f), 'utf-8'));
		await sql.unsafe('insert into schema_migrations (id) values ($1)', [f.replace(/\.sql$/, '')]);
	}
}, 120_000);

afterAll(async () => {
	await sql?.end({ timeout: 2 });
	await server?.stop();
	await pg?.close();
});

describe('knownPlaces', () => {
	it('reads the circles of accounts and devices and the places of accounts, and nothing else', async () => {
		const [{ uid }] = await sql<{ uid: string }[]>`
			insert into users (id, name) values (gen_random_uuid(), 'owner') returning id as uid`;
		const [{ did }] = await sql<{ did: string }[]>`
			insert into app_devices (id, secret_hash, fcm_token) values (gen_random_uuid(), '\x01', 't1') returning id as did`;
		const circle = (owner: 'user_id' | 'device_id', id: string, name: string, lat: number, lon: number) =>
			sql.unsafe(
				`insert into zones (id, ${owner}, name, kind, geom, lat, lon, radius_km, kinds)
				 values (gen_random_uuid(), $1, $2, 'circle',
				   st_buffer(st_setsrid(st_makepoint($4, $3), 4326)::geography, 10000)::geography, $3, $4, 10, '{VIGILANCE}')`,
				[id, name, lat, lon]
			);
		await circle('user_id', uid, 'Lorient', 47.75, -3.37);
		await circle('device_id', did, 'Lorient again', 47.76, -3.36);
		await circle('device_id', did, 'Corte', 42.3, 9.15);
		await sql`insert into zones (id, user_id, name, kind, country, kinds)
			values (gen_random_uuid(), ${uid}, 'France', 'country', 'FR', '{VIGILANCE}')`;
		await sql`insert into places (id, user_id, name, kind, lat, lon)
			values (gen_random_uuid(), ${uid}, 'Brest', 'place', 48.39, -4.49)`;

		const rows = await knownPlaces(sql);
		expect(rows).toHaveLength(4);
		const cells = selectCells(rows, 10);
		// The two Lorient circles share a cell and come first; the country zone gave nothing.
		expect(cells).toEqual([
			{ lat: 47.75, lon: -3.35 },
			{ lat: 42.3, lon: 9.15 },
			{ lat: 48.4, lon: -4.5 }
		]);
	});
});
