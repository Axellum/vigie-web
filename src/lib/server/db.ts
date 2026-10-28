// The site's own database, for the accounts. It is optional: without DATABASE_URL the site runs without
// accounts, as before. The migrations run once, at the first use, under a lock (several processes may start).
import postgres from 'postgres';
import { DATABASE_URL, DATABASE_POOL_MAX } from '$app/env/private';
import accounts from './migrations/001_accounts.sql?raw';
import zones from './migrations/002_zones.sql?raw';
import notifications from './migrations/003_notifications.sql?raw';
import nativeDevices from './migrations/004_native_devices.sql?raw';

const MIGRATIONS = [
	{ id: '001_accounts', sql: accounts },
	{ id: '002_zones', sql: zones },
	{ id: '003_notifications', sql: notifications },
	{ id: '004_native_devices', sql: nativeDevices }
];

export type Sql = postgres.Sql;
/** The connection or a transaction: what a query needs. */
export type Query = postgres.Sql | postgres.TransactionSql;

let client: Sql | null = null;
let ready: Promise<void> | null = null;

export function accountsEnabled(): boolean {
	return Boolean(DATABASE_URL);
}

async function migrate(sql: Sql): Promise<void> {
	await sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(20261020)');
		await tx.unsafe(
			'create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())'
		);
		const rows = await tx.unsafe<{ id: string }[]>('select id from schema_migrations');
		const done = new Set(rows.map((r) => r.id));
		for (const m of MIGRATIONS) {
			if (done.has(m.id)) continue;
			await tx.unsafe(m.sql);
			await tx.unsafe('insert into schema_migrations (id) values ($1)', [m.id]);
		}
	});
}

/** The database, migrated. Throws when accounts are off or when the database cannot be reached. */
export async function db(): Promise<Sql> {
	if (!DATABASE_URL) throw new Error('accounts are off: DATABASE_URL is not set');
	const max = Number(DATABASE_POOL_MAX);
	client ??= postgres(DATABASE_URL, {
		max: Number.isInteger(max) && max > 0 ? max : 5,
		idle_timeout: 60,
		connect_timeout: 10,
		onnotice: () => {}
	});
	ready ??= migrate(client).catch((e) => {
		ready = null;
		throw e;
	});
	await ready;
	return client;
}
