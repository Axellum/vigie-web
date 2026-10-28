// The places a visitor follows without an account. They are kept in this browser only (localStorage) and never
// sent to the site: the page reads them to show their chips, and a place is asked for like any other.
import { asProfile, type Profile } from './profiles';
import { ZONE_RADII_KM } from './zones';

export interface FollowedPlace {
	lat: number;
	lon: number;
	radiusKm: number;
	/** The name of the place when it was found by name; null for a position or a click on the map. */
	name: string | null;
	profile: Profile | null;
}

/** A place of an account: one of its zones that is a point and a radius, kept on the server with the account. */
export interface AccountPlace {
	id: string;
	name: string;
	lat: number;
	lon: number;
	radiusKm: number;
	profile: Profile | null;
}

export const FOLLOWED_KEY = 'vigie-places';
export const MAX_FOLLOWED = 10;
const MAX_NAME = 80;

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** The followed places stored in the browser; entries that cannot be read are dropped. */
export function parseFollowed(raw: string | null): FollowedPlace[] {
	let list: unknown;
	try {
		list = JSON.parse(raw ?? '[]');
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	const out: FollowedPlace[] = [];
	for (const item of list) {
		if (!item || typeof item !== 'object') continue;
		const { lat, lon, radiusKm, name, profile } = item as Record<string, unknown>;
		if (typeof lat !== 'number' || typeof lon !== 'number') continue;
		if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) continue;
		const place: FollowedPlace = {
			lat: round3(lat),
			lon: round3(lon),
			radiusKm: typeof radiusKm === 'number' && ZONE_RADII_KM.includes(radiusKm) ? radiusKm : 300,
			name: typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME) : null,
			profile: asProfile(profile)
		};
		if (!out.some((p) => sameSpot(p, place))) out.push(place);
		if (out.length === MAX_FOLLOWED) break;
	}
	return out;
}

/** The same spot: equal to about 100 m (3 decimals), as in the address of the page. */
export function sameSpot(a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean {
	return round3(a.lat) === round3(b.lat) && round3(a.lon) === round3(b.lon);
}

/** The list with this place followed (its settings replaced when it already was), or unchanged when full. */
export function follow(list: FollowedPlace[], place: FollowedPlace): FollowedPlace[] {
	const at = list.findIndex((p) => sameSpot(p, place));
	if (at >= 0) return list.map((p, i) => (i === at ? place : p));
	return list.length >= MAX_FOLLOWED ? list : [...list, place];
}

export function unfollow(list: FollowedPlace[], place: { lat: number; lon: number }): FollowedPlace[] {
	return list.filter((p) => !sameSpot(p, place));
}

/** The followed places of this browser; none when the storage cannot be read (private window, blocked). */
export function readFollowed(): FollowedPlace[] {
	try {
		return parseFollowed(localStorage.getItem(FOLLOWED_KEY));
	} catch {
		return [];
	}
}

/** Keeps the list in this browser; false when the storage refuses it. */
export function writeFollowed(list: FollowedPlace[]): boolean {
	try {
		if (list.length) localStorage.setItem(FOLLOWED_KEY, JSON.stringify(list));
		else localStorage.removeItem(FOLLOWED_KEY);
		return true;
	} catch {
		return false;
	}
}
