// The places an account keeps for "My page", in the database. (src/lib/server/places.ts is the search by name.)
// The home is a place of kind 'home': at most one, stored to about 1 km, and never public.
import { randomUUID } from 'node:crypto';
import { ALERT_DEFAULTS, MAX_PLACES, type PlaceKind, type SavedPlaceInput } from '#lib/myPlaces.js';
import type { Profile } from '#lib/profiles.js';
import type { Query, Sql } from './db';
import { addZone, removeZone } from './zones';

export interface SavedPlace {
	id: string;
	name: string;
	kind: PlaceKind;
	lat: number;
	lon: number;
	radiusKm: number;
	profile: Profile | null;
	/** Shown on the public page of the account; never true for the home. */
	public: boolean;
	/** The zone that sends this place's alerts, when the person asked for them. */
	zoneId: string | null;
	createdAt: number;
}

export class PlaceError extends Error {
	constructor(public code: 'full' | 'unknown') {
		super(code);
	}
}

type Row = {
	id: string;
	name: string;
	kind: PlaceKind;
	lat: number;
	lon: number;
	radius_km: number;
	profile: Profile | null;
	public: boolean;
	zone_id: string | null;
	created_at: Date;
};

function fromRow(r: Row): SavedPlace {
	return {
		id: r.id,
		name: r.name,
		kind: r.kind,
		lat: r.lat,
		lon: r.lon,
		radiusKm: r.radius_km,
		profile: r.profile,
		public: r.public,
		zoneId: r.zone_id,
		createdAt: Math.floor(r.created_at.getTime() / 1000)
	};
}

const UUID = /^[0-9a-f-]{36}$/;

/** The places of the account in the order the person gave them; the home first. */
export async function listPlaces(sql: Sql, userId: string): Promise<SavedPlace[]> {
	const rows = await sql<Row[]>`
		select id, name, kind, lat, lon, radius_km, profile, public, zone_id, created_at
		from places where user_id = ${userId} order by (kind = 'home') desc, position, created_at`;
	return rows.map(fromRow);
}

/** Adds a place at the end of the list. At most `MAX_PLACES` places besides the home. */
export async function addPlace(sql: Sql, userId: string, place: SavedPlaceInput): Promise<string> {
	const id = randomUUID();
	await sql.begin(async (tx) => {
		// One writer at a time per account, so that two requests cannot both pass the limit.
		await tx.unsafe('select pg_advisory_xact_lock(hashtextextended($1, 6))', [userId]);
		const [{ n, next }] = await tx.unsafe<{ n: number; next: number }[]>(
			`select count(*)::int as n, coalesce(max(position), 0) + 1 as next
			from places where user_id = $1 and kind = 'place'`,
			[userId]
		);
		if (n >= MAX_PLACES) throw new PlaceError('full');
		await tx.unsafe(
			`insert into places (id, user_id, name, kind, lat, lon, radius_km, profile, position)
			values ($1, $2, $3, 'place', $4, $5, $6, $7, $8)`,
			[id, userId, place.name, place.lat, place.lon, place.radiusKm, place.profile, next]
		);
	});
	return id;
}

/** Changes what the person typed about a place (its name, point, radius, profile); not its kind. The database
 *  rounds the point to what the kind allows, whatever the caller sent. */
export async function updatePlace(
	sql: Sql,
	userId: string,
	placeId: string,
	place: SavedPlaceInput
): Promise<void> {
	if (!UUID.test(placeId)) throw new PlaceError('unknown');
	await sql.begin(async (tx) => {
		const updated = await tx.unsafe(
			`update places set name = $3, radius_km = $4, profile = $5,
				lat = round($6::numeric, case kind when 'home' then 2 else 3 end)::float8,
				lon = round($7::numeric, case kind when 'home' then 2 else 3 end)::float8
			where id = $1 and user_id = $2 returning id`,
			[placeId, userId, place.name, place.radiusKm, place.profile, place.lat, place.lon]
		);
		if (updated.length === 0) throw new PlaceError('unknown');
		await followPlace(tx, userId, placeId);
	});
}

/**
 * Makes the zone that sends a place's alerts say what the place now says (its name, point, radius, profile), when
 * the place has one and it is a circle: the two are one thing for the person. A zone that moved or changed size is
 * compared again without notifying (`baseline_done`), as a new zone is: what is in force at its new place is not news.
 */
async function followPlace(q: Query, userId: string, placeId: string): Promise<void> {
	await q.unsafe(
		`update zones z set name = p.name, lat = p.lat, lon = p.lon, radius_km = p.radius_km, profile = p.profile,
			geom = ST_Buffer(ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography, p.radius_km * 1000.0)::geography(Polygon, 4326),
			baseline_done = z.baseline_done and z.lat = p.lat and z.lon = p.lon and z.radius_km = p.radius_km
		from places p
		where p.id = $1 and p.user_id = $2 and z.id = p.zone_id and z.user_id = $2 and z.kind = 'circle'`,
		[placeId, userId]
	);
}

/**
 * Turns the alerts of a place on or off. On: a circle zone of the place's own point and radius is made, with the
 * levels and kinds a new zone starts from, and linked to the place (the person refines them on their account). Off:
 * that zone is removed, and with it what was recorded for it. Already on or off: nothing changes. A zone the
 * account holds besides this one is not touched. At most `MAX_ZONES` zones: a `ZoneError('full')` otherwise.
 */
export async function setAlerts(sql: Sql, userId: string, placeId: string, on: boolean): Promise<void> {
	if (!UUID.test(placeId)) throw new PlaceError('unknown');
	const [place] = await sql<Row[]>`
		select id, name, kind, lat, lon, radius_km, profile, public, zone_id, created_at
		from places where id = ${placeId} and user_id = ${userId}`;
	if (!place) throw new PlaceError('unknown');
	if (!on) {
		if (place.zone_id) await removeZone(sql, userId, place.zone_id);
		return;
	}
	if (place.zone_id) return;
	const zoneId = await addZone(sql, userId, {
		kind: 'circle',
		name: place.name,
		lat: place.lat,
		lon: place.lon,
		radiusKm: place.radius_km,
		profile: place.profile,
		...ALERT_DEFAULTS
	});
	// Two requests that both found no zone: the later one gives its zone back.
	const linked = await sql`
		update places set zone_id = ${zoneId} where id = ${placeId} and user_id = ${userId} and zone_id is null
		returning id`;
	if (linked.length === 0) await removeZone(sql, userId, zoneId).catch(() => {});
}

/** Sets the home: the first time it makes one, then it moves the same one (its blocks stay on the pages). The point
 *  is rounded to about 1 km here, and the database refuses a finer one. */
export async function setHome(sql: Sql, userId: string, place: SavedPlaceInput): Promise<string> {
	const [row] = await sql<{ id: string }[]>`
		insert into places (id, user_id, name, kind, lat, lon, radius_km, profile, public, position)
		values (${randomUUID()}, ${userId}, ${place.name}, 'home', round(${place.lat}::numeric, 2)::float8,
			round(${place.lon}::numeric, 2)::float8, ${place.radiusKm}, ${place.profile}, false, 0)
		on conflict (user_id) where kind = 'home'
		do update set name = excluded.name, lat = excluded.lat, lon = excluded.lon,
			radius_km = excluded.radius_km, profile = excluded.profile
		returning id`;
	await followPlace(sql, userId, row.id);
	return row.id;
}

/** Removes a place, and the blocks of the account's pages that showed it. */
export async function removePlace(sql: Sql, userId: string, placeId: string): Promise<void> {
	if (!UUID.test(placeId)) throw new PlaceError('unknown');
	await sql.begin(async (tx) => {
		const removed = await tx.unsafe('delete from places where id = $1 and user_id = $2 returning id', [
			placeId,
			userId
		]);
		if (removed.length === 0) throw new PlaceError('unknown');
		await stripBlocks(tx, userId);
	});
}

/** Takes out of the pages of the account the blocks whose place no longer exists. */
async function stripBlocks(tx: Query, userId: string): Promise<void> {
	await tx.unsafe(
		`update pages set blocks = coalesce((
				select jsonb_agg(b order by o)
				from jsonb_array_elements(pages.blocks) with ordinality as e(b, o)
				where exists (select 1 from places p where p.user_id = pages.user_id and p.id::text = e.b ->> 'place')
			), '[]'::jsonb), updated_at = now()
		where user_id = $1
			and exists (
				select 1 from jsonb_array_elements(pages.blocks) as e(b)
				where not exists (select 1 from places p where p.user_id = pages.user_id and p.id::text = e.b ->> 'place')
			)`,
		[userId]
	);
}
