// The devices of the Android app that follow their own places without an account: the bells of the app. The app
// registers once with its Firebase Cloud Messaging token and gets a secret back, of which the server keeps only the
// SHA-256; every later change (its places, a new token, its language) comes with that secret. Its places are zones of
// the device: circles matched and told like the zones of an account (notify.ts), under the same rules (compared once
// without notifying, told once per level, quiet hours when asked).
//
// What the server keeps is the least that works: the token (to send), each place's name, its point to about 1 km
// (two decimals), its radius and its lowest level, and 30 days of what the places matched. No account, no address.
// A device the app has not shown for 60 days is forgotten with its places (cleanUp).
import { randomUUID } from 'node:crypto';
import type { Lang } from '#lib/i18n.js';
import { cleanName } from '#lib/names.js';
import type { Level } from '#lib/types.js';
import { ALERT_KINDS, MAX_ZONES, MIN_LEVELS, ZONE_RADII_KM } from '#lib/zones.js';
import { digest, newSecret } from './accounts';
import type { Query, Sql } from './db';
import { fcmEnabled, isFcmToken, sendFcm } from './fcm';
import type { PushMessage } from './push';
import { AddressLimits } from './signup';

/** The devices the server holds at most, unless VIGIE_MAX_APP_DEVICES says otherwise. */
export const DEFAULT_MAX_APP_DEVICES = 5000;
/** The radius of a place when the app gives none: the place and its surroundings. */
export const DEFAULT_RADIUS_KM = 10;
/** The kinds of alert a place follows: those of a new zone of an account (savedPlaces.ts), without the solar
 *  storms, which are seen from a whole half of the Earth. */
export const PLACE_KINDS = ALERT_KINDS.filter((k) => k !== 'SOLAR_STORM');

const HOUR_MS = 3_600_000;
/** New devices: 30 an hour for an address (a family or a mobile network shares one). */
export const registrations = new AddressLimits(30, HOUR_MS);
/** Test notifications: 10 an hour for a device. */
export const tests = new AddressLimits(10, HOUR_MS);

export class AppDeviceError extends Error {
	constructor(public code: 'body' | 'token' | 'places' | 'full') {
		super(code);
	}
}

/** A place as the app sends it, checked. */
export interface AppPlace {
	name: string;
	lat: number;
	lon: number;
	radiusKm: number;
	minLevel: Level;
}

/** What the app sends when it registers or changes something. */
export interface AppDeviceInput {
	token: string;
	lang: Lang;
	timeZone: string | null;
	quietHours: boolean;
	places: AppPlace[];
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

function coordinate(value: unknown, limit: number): number | null {
	return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
		? round2(value)
		: null;
}

export function validTimeZone(zone: unknown): zone is string {
	if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

function parsePlace(value: unknown): AppPlace | null {
	const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	if (!o) return null;
	const name = cleanName(o.name);
	const lat = coordinate(o.lat, 85);
	const lon = coordinate(o.lon, 180);
	const radiusKm = o.radiusKm === undefined ? DEFAULT_RADIUS_KM : o.radiusKm;
	const minLevel = o.minLevel === undefined ? 'YELLOW' : o.minLevel;
	if (!name || lat == null || lon == null) return null;
	if (typeof radiusKm !== 'number' || !ZONE_RADII_KM.includes(radiusKm)) return null;
	if (typeof minLevel !== 'string' || !(MIN_LEVELS as string[]).includes(minLevel)) return null;
	return { name, lat, lon, radiusKm, minLevel: minLevel as Level };
}

/** The app's JSON, checked: the first problem otherwise. Two places at the same point and radius are one. */
export function parseAppDevice(body: unknown): AppDeviceInput | AppDeviceError {
	const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
	if (!o) return new AppDeviceError('body');
	if (!isFcmToken(o.token)) return new AppDeviceError('token');
	const list = o.places ?? [];
	if (!Array.isArray(list) || list.length > MAX_ZONES) return new AppDeviceError('places');
	const places: AppPlace[] = [];
	for (const item of list) {
		const place = parsePlace(item);
		if (!place) return new AppDeviceError('places');
		if (!places.some((p) => p.lat === place.lat && p.lon === place.lon && p.radiusKm === place.radiusKm))
			places.push(place);
	}
	return {
		token: o.token,
		lang: o.lang === 'en' ? 'en' : 'fr',
		timeZone: validTimeZone(o.timeZone) ? o.timeZone : null,
		quietHours: o.quietHours === true,
		places
	};
}

/** The secret of an `Authorization: Bearer …` header, or null. */
export function bearer(header: string | null): string | null {
	const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
	return m ? m[1] : null;
}

/** The device of a secret, marked as seen; null when the server does not know it (the app registers again). */
export async function deviceBySecret(sql: Query, secret: string): Promise<{ id: string; lang: Lang } | null> {
	const [row] = await sql<{ id: string; lang: Lang }[]>`
		update app_devices set seen_at = now() where secret_hash = ${digest(secret)} returning id, lang`;
	return row ?? null;
}

/** Makes the device's zones be its places: a place kept as it was keeps its zone (its baseline and history),
 *  one that moved, changed radius or level is a new zone (compared again without notifying), one that went goes. */
async function syncPlaces(tx: Query, deviceId: string, places: AppPlace[]): Promise<void> {
	const zones = await tx<{ id: string; lat: number; lon: number; radius_km: number; min_level: Level }[]>`
		select id, lat, lon, radius_km, min_level from zones where device_id = ${deviceId}`;
	const same = (z: (typeof zones)[number], p: AppPlace) =>
		z.lat === p.lat && z.lon === p.lon && z.radius_km === p.radiusKm && z.min_level === p.minLevel;
	const kept = new Set<string>();
	for (const p of places) {
		const zone = zones.find((z) => !kept.has(z.id) && same(z, p));
		if (zone) {
			kept.add(zone.id);
			await tx`update zones set name = ${p.name} where id = ${zone.id}`;
			continue;
		}
		const id = randomUUID();
		kept.add(id);
		await tx.unsafe(
			`insert into zones (id, device_id, name, kind, min_level, kinds, lat, lon, radius_km, geom)
			values ($1, $2, $3, 'circle', $4, $5, $6::float8, $7::float8, $8::int,
				ST_Buffer(ST_SetSRID(ST_MakePoint($7::float8, $6::float8), 4326)::geography, $8::int * 1000.0)::geography(Polygon, 4326))`,
			[id, deviceId, p.name, p.minLevel, PLACE_KINDS, p.lat, p.lon, p.radiusKm]
		);
	}
	const gone = zones.filter((z) => !kept.has(z.id)).map((z) => z.id);
	if (gone.length) await tx`delete from zones where id in ${tx(gone)}`;
}

/**
 * A new device and its places; its secret, shown once. The same token registered again (the app lost its secret)
 * replaces the device it was. Throws AppDeviceError('full') when the server holds `max` devices already.
 */
export async function registerAppDevice(sql: Sql, input: AppDeviceInput, max: number): Promise<string> {
	const secret = newSecret();
	await sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(20261123)');
		await tx`delete from app_devices where fcm_token = ${input.token}`;
		const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from app_devices`;
		if (n >= max) throw new AppDeviceError('full');
		const id = randomUUID();
		await tx`
			insert into app_devices (id, secret_hash, fcm_token, lang, time_zone, quiet_hours)
			values (${id}, ${digest(secret)}, ${input.token}, ${input.lang}, ${input.timeZone}, ${input.quietHours})`;
		await syncPlaces(tx, id, input.places);
	});
	return secret;
}

/** Changes a device: its token, settings and places. False when the secret is unknown. */
export async function updateAppDevice(sql: Sql, secret: string, input: AppDeviceInput): Promise<boolean> {
	return sql.begin(async (tx) => {
		const device = await deviceBySecret(tx, secret);
		if (!device) return false;
		// A token the app no longer has may sit on another row (an older registration): the latest wins.
		await tx`delete from app_devices where fcm_token = ${input.token} and id <> ${device.id}`;
		await tx`
			update app_devices set fcm_token = ${input.token}, lang = ${input.lang}, time_zone = ${input.timeZone},
				quiet_hours = ${input.quietHours}
			where id = ${device.id}`;
		await syncPlaces(tx, device.id, input.places);
		return true;
	});
}

/** Forgets a device, its places and what they were told. False when the secret is unknown. */
export async function removeAppDevice(sql: Sql, secret: string): Promise<boolean> {
	const removed = await sql`delete from app_devices where secret_hash = ${digest(secret)} returning id`;
	return removed.length > 0;
}

/** The device's places as the server keeps them, for the app to check and for the tests. */
export async function listAppPlaces(sql: Query, deviceId: string): Promise<AppPlace[]> {
	const rows = await sql<{ name: string; lat: number; lon: number; radius_km: number; min_level: Level }[]>`
		select name, lat, lon, radius_km, min_level from zones where device_id = ${deviceId} order by name`;
	return rows.map((r) => ({
		name: r.name,
		lat: r.lat,
		lon: r.lon,
		radiusKm: r.radius_km,
		minLevel: r.min_level
	}));
}

/**
 * One notification to a device; null when FCM is off. The same rules as the devices of an account (push.ts): a
 * token FCM no longer knows is forgotten with its places, five failures in a row too; the server's own fault does
 * not count.
 */
export async function sendToDevice(
	sql: Query,
	deviceId: string,
	message: PushMessage
): Promise<{ sent: number; failed: number } | null> {
	if (!fcmEnabled()) return null;
	const [row] = await sql<{ fcm_token: string }[]>`select fcm_token from app_devices where id = ${deviceId}`;
	if (!row) return { sent: 0, failed: 0 };
	const result = await sendFcm(row.fcm_token, message);
	if (result === 'sent') {
		await sql`update app_devices set last_sent_at = now(), failures = 0 where id = ${deviceId}`;
		return { sent: 1, failed: 0 };
	}
	if (result === 'gone') await sql`delete from app_devices where id = ${deviceId}`;
	else if (result !== 'server') {
		const [after] = await sql<{ failures: number }[]>`
			update app_devices set failures = failures + 1 where id = ${deviceId} returning failures`;
		if ((after?.failures ?? 0) >= 5) await sql`delete from app_devices where id = ${deviceId}`;
	}
	console.error(`push: a device of the app failed (${result})`);
	return { sent: 0, failed: 1 };
}
