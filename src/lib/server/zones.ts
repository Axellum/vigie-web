// The zones of an account in the database. The surface of a circle or a polygon is a PostGIS geography, so
// that the alerts can later be matched to the zones in one query.
import { randomUUID } from 'node:crypto';
import { hasBox } from '#lib/geo.js';
import type { Profile } from '#lib/profiles.js';
import type { Level } from '#lib/types.js';
import { MAX_ZONES, polygonWkt, type AlertKind, type ZoneInput } from '#lib/zones.js';
import type { Sql } from './db';

/** The largest surface a drawn polygon may have: about the area of the European Union. */
const MAX_POLYGON_KM2 = 5_000_000;

export interface Zone {
	id: string;
	name: string;
	kind: 'circle' | 'polygon' | 'country' | 'area';
	lat: number | null;
	lon: number | null;
	radiusKm: number | null;
	country: string | null;
	area: string | null;
	/** The corners of a polygon, [lon, lat], not closed. */
	corners: [number, number][] | null;
	minLevel: Level;
	kinds: AlertKind[];
	/** What "near me" shows first for the zone; it changes no alert. */
	profile: Profile | null;
	createdAt: number;
}

export class ZoneError extends Error {
	constructor(public code: 'shape' | 'country' | 'polygon' | 'size' | 'full' | 'unknown') {
		super(code);
	}
}

type Row = {
	id: string;
	name: string;
	kind: Zone['kind'];
	lat: number | null;
	lon: number | null;
	radius_km: number | null;
	country: string | null;
	area: string | null;
	shape: string | null;
	min_level: Level;
	kinds: AlertKind[];
	profile: Profile | null;
	created_at: Date;
};

function fromRow(r: Row): Zone {
	let corners: [number, number][] | null = null;
	if (r.kind === 'polygon' && r.shape) {
		const ring = (JSON.parse(r.shape) as { coordinates: [number, number][][] }).coordinates[0];
		corners = ring.slice(0, -1);
	}
	return {
		id: r.id,
		name: r.name,
		kind: r.kind,
		lat: r.lat,
		lon: r.lon,
		radiusKm: r.radius_km,
		country: r.country,
		area: r.area,
		corners,
		minLevel: r.min_level,
		kinds: r.kinds,
		profile: r.profile,
		createdAt: Math.floor(r.created_at.getTime() / 1000)
	};
}

export async function listZones(sql: Sql, userId: string): Promise<Zone[]> {
	const rows = await sql<Row[]>`
		select id, name, kind, lat, lon, radius_km, country, area, min_level, kinds, profile, created_at,
			case when kind = 'polygon' then ST_AsGeoJSON(geom, 3) end as shape
		from zones where user_id = ${userId} order by created_at`;
	return rows.map(fromRow);
}

export async function addZone(sql: Sql, userId: string, zone: ZoneInput): Promise<string> {
	const id = randomUUID();
	if ((zone.kind === 'country' || zone.kind === 'area') && !hasBox(zone.country))
		throw new ZoneError('country');
	if (zone.kind === 'polygon') {
		const wkt = polygonWkt(zone.corners);
		const [check] = await sql<{ valid: boolean; km2: number | null }[]>`
			select ST_IsValid(ST_GeomFromText(${wkt}, 4326)) as valid,
				ST_Area(ST_GeogFromText(${wkt})) / 1e6 as km2`;
		if (!check?.valid) throw new ZoneError('polygon');
		if ((check.km2 ?? Infinity) > MAX_POLYGON_KM2) throw new ZoneError('size');
	}
	await sql.begin(async (tx) => {
		const [{ n }] = await tx.unsafe<{ n: number }[]>(
			'select count(*)::int as n from zones where user_id = $1',
			[userId]
		);
		if (n >= MAX_ZONES) throw new ZoneError('full');
		const common = [id, userId, zone.name, zone.kind, zone.minLevel, zone.kinds, zone.profile];
		switch (zone.kind) {
			case 'circle':
				await tx.unsafe(
					`insert into zones (id, user_id, name, kind, min_level, kinds, profile, lat, lon, radius_km, geom)
					values ($1, $2, $3, $4, $5, $6, $7, $8::float8, $9::float8, $10::int,
						ST_Buffer(ST_SetSRID(ST_MakePoint($9::float8, $8::float8), 4326)::geography, $10::int * 1000.0)::geography(Polygon, 4326))`,
					[...common, zone.lat, zone.lon, zone.radiusKm]
				);
				break;
			case 'polygon':
				await tx.unsafe(
					`insert into zones (id, user_id, name, kind, min_level, kinds, profile, geom)
					values ($1, $2, $3, $4, $5, $6, $7, ST_GeogFromText($8)::geography(Polygon, 4326))`,
					[...common, polygonWkt(zone.corners)]
				);
				break;
			case 'country':
				await tx.unsafe(
					'insert into zones (id, user_id, name, kind, min_level, kinds, profile, country) values ($1, $2, $3, $4, $5, $6, $7, $8)',
					[...common, zone.country]
				);
				break;
			case 'area':
				await tx.unsafe(
					'insert into zones (id, user_id, name, kind, min_level, kinds, profile, country, area) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
					[...common, zone.country, zone.area]
				);
				break;
		}
	});
	return id;
}

export async function removeZone(sql: Sql, userId: string, zoneId: string): Promise<void> {
	if (!/^[0-9a-f-]{36}$/.test(zoneId)) throw new ZoneError('unknown');
	const removed = await sql`delete from zones where id = ${zoneId} and user_id = ${userId} returning id`;
	if (removed.length === 0) throw new ZoneError('unknown');
}

/** The profile of a zone of this account; the zone's alerts do not change. */
export async function setZoneProfile(
	sql: Sql,
	userId: string,
	zoneId: string,
	profile: Profile | null
): Promise<void> {
	if (!/^[0-9a-f-]{36}$/.test(zoneId)) throw new ZoneError('unknown');
	const updated = await sql`
		update zones set profile = ${profile} where id = ${zoneId} and user_id = ${userId} returning id`;
	if (updated.length === 0) throw new ZoneError('unknown');
}
