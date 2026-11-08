// The places an account keeps for "My page": a name, a point, the radius looked at and, optionally, a profile. The
// home is one of them, stored less precisely (about 1 km) and never public. This file only reads and rounds what a
// form sends; the database (src/lib/server/savedPlaces.ts) enforces the same limits.
import { cleanName } from './names';
import { asProfile, type Profile } from './profiles';
import { ZONE_RADII_KM } from './zones';

/** The places a person can keep besides their home. */
export const MAX_PLACES = 20;
export const DEFAULT_RADIUS_KM = 25;

export type PlaceKind = 'place' | 'home';

export interface SavedPlaceInput {
	name: string;
	lat: number;
	lon: number;
	radiusKm: number;
	profile: Profile | null;
}

export type SavedPlaceError = 'name' | 'shape';

/** About 100 m for a place, about 1 km for the home: where a person lives is not stored to the street. */
const DECIMALS: Record<PlaceKind, number> = { place: 3, home: 2 };

export function roundCoordinate(value: number, kind: PlaceKind): number {
	const k = 10 ** DECIMALS[kind];
	return Math.round(value * k) / k + 0;
}

function coordinate(value: unknown, limit: number, kind: PlaceKind): number | null {
	const n =
		typeof value === 'string' && value.trim() !== ''
			? Number(value)
			: typeof value === 'number'
				? value
				: NaN;
	return Number.isFinite(n) && Math.abs(n) <= limit ? roundCoordinate(n, kind) : null;
}

/** Reads a place from a form; the first problem found otherwise. No radius is the default radius; a radius the
 *  site does not offer is refused. A profile the site does not know is no profile. */
export function parseSavedPlace(
	form: { get(name: string): unknown },
	kind: PlaceKind
): { ok: true; place: SavedPlaceInput } | { ok: false; error: SavedPlaceError } {
	const name = cleanName(form.get('name'));
	if (!name) return { ok: false, error: 'name' };
	const lat = coordinate(form.get('lat'), 90, kind);
	const lon = coordinate(form.get('lon'), 180, kind);
	const raw = form.get('radiusKm');
	const radiusKm = raw == null || raw === '' ? DEFAULT_RADIUS_KM : Number(raw);
	if (lat == null || lon == null || !ZONE_RADII_KM.includes(radiusKm)) return { ok: false, error: 'shape' };
	return { ok: true, place: { name, lat, lon, radiusKm, profile: asProfile(form.get('profile')) } };
}
