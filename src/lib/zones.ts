// Zones to watch, as a person sets them in their account: a circle, a drawn polygon, a country or an
// official warning area, with the lowest level and the kinds of alert wanted. Pure functions: the server
// checks a form with them before anything reaches the database.
import { cleanName } from './names';
import { asProfile, type Profile } from './profiles';
import type { Level } from './types';

/** 'VIGILANCE' is the official warnings; the others are the API's categories of hazard. */
export const ALERT_KINDS = [
	'VIGILANCE',
	'EARTHQUAKE',
	'TSUNAMI',
	'VOLCANO',
	'HURRICANE',
	'TORNADO',
	'FLOOD',
	'EXTREME_RAIN',
	'WILDFIRE',
	'SOLAR_STORM'
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ZONE_RADII_KM = [5, 10, 25, 50, 100, 300, 500, 1000];
export const MIN_LEVELS: Level[] = ['YELLOW', 'ORANGE', 'RED'];
export const MAX_ZONES = 10;
export const MAX_CORNERS = 200;

export type ZoneShape =
	| { kind: 'circle'; lat: number; lon: number; radiusKm: number }
	| { kind: 'polygon'; corners: [number, number][] }
	| { kind: 'country'; country: string }
	| { kind: 'area'; country: string; area: string };

/** `profile` only orders the cards of "near me" for the zone; the alerts follow the level and the kinds. */
export type ZoneInput = ZoneShape & {
	name: string;
	minLevel: Level;
	kinds: AlertKind[];
	profile: Profile | null;
};

export type ZoneError = 'name' | 'shape' | 'level' | 'kinds';

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

function coordinate(value: unknown, limit: number): number | null {
	const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
	return Number.isFinite(n) && Math.abs(n) <= limit ? round3(n) : null;
}

function corners(value: unknown): [number, number][] | null {
	if (typeof value !== 'string' || value.length > 20_000) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > MAX_CORNERS) return null;
	const out: [number, number][] = [];
	for (const c of parsed) {
		if (!Array.isArray(c) || c.length !== 2) return null;
		const [lon, lat] = c;
		if (typeof lon !== 'number' || typeof lat !== 'number') return null;
		if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 85)
			return null;
		out.push([round3(lon), round3(lat)]);
	}
	return out;
}

/** Reads a zone from a form; the first problem found otherwise. The shape's own checks (a polygon that
 *  crosses itself, a country with no border) are the server's. */
export function parseZone(form: {
	get(name: string): unknown;
	getAll(name: string): unknown[];
}): { ok: true; zone: ZoneInput } | { ok: false; error: ZoneError } {
	const name = cleanName(form.get('name'));
	if (!name) return { ok: false, error: 'name' };
	const level = form.get('minLevel');
	if (typeof level !== 'string' || !(MIN_LEVELS as string[]).includes(level))
		return { ok: false, error: 'level' };
	const kinds = [...new Set(form.getAll('kinds'))].filter((k): k is AlertKind =>
		(ALERT_KINDS as readonly unknown[]).includes(k)
	);
	if (kinds.length === 0) return { ok: false, error: 'kinds' };
	// No profile, or one the site does not know, is no profile: never a refused zone.
	const base = { name, minLevel: level as Level, kinds, profile: asProfile(form.get('profile')) };

	const country =
		typeof form.get('country') === 'string' ? (form.get('country') as string).toUpperCase() : '';
	switch (form.get('kind')) {
		case 'circle': {
			const lat = coordinate(form.get('lat'), 90);
			const lon = coordinate(form.get('lon'), 180);
			const radiusKm = Number(form.get('radiusKm'));
			if (lat == null || lon == null || !ZONE_RADII_KM.includes(radiusKm))
				return { ok: false, error: 'shape' };
			return { ok: true, zone: { ...base, kind: 'circle', lat, lon, radiusKm } };
		}
		case 'polygon': {
			const c = corners(form.get('corners'));
			return c ? { ok: true, zone: { ...base, kind: 'polygon', corners: c } } : { ok: false, error: 'shape' };
		}
		case 'country':
			return /^[A-Z]{2}$/.test(country)
				? { ok: true, zone: { ...base, kind: 'country', country } }
				: { ok: false, error: 'shape' };
		case 'area': {
			const area = cleanName(form.get('area'), 120);
			return /^[A-Z]{2}$/.test(country) && area
				? { ok: true, zone: { ...base, kind: 'area', country, area } }
				: { ok: false, error: 'shape' };
		}
		default:
			return { ok: false, error: 'shape' };
	}
}

/** The polygon as WKT, closed (PostGIS reads it). */
export function polygonWkt(c: [number, number][]): string {
	const ring = [...c, c[0]].map(([lon, lat]) => `${lon} ${lat}`).join(', ');
	return `POLYGON((${ring}))`;
}
