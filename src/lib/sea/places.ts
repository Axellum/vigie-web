// The places of the coast (vigie-api `GET /v1/sea/places`, its ADR 0021): ports, slipways, anchorages, dive sites and bathing sites,
// read from OpenStreetMap, the Sandre and the bathing results of the Ministry of Health. A catalogue, not a forecast: the API says
// what a place is and where, never whether it can be used today. This file only reads its answer and puts it in words' order; a
// value the API did not give is left out, never guessed. Nothing here is for safety.
import type { SeaRow } from './overview';

export const PLACE_TYPES = ['port', 'slipway', 'anchorage', 'dive', 'bathing'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

/** The class of a bathing site over the four years 2021 to 2024 (the European directive's classes), not the water of today. */
export const QUALITIES = ['excellent', 'good', 'sufficient', 'poor', 'unclassified'] as const;
export type Quality = (typeof QUALITIES)[number];

/** What a port is used for, as the Sandre lists it. */
export const USES = ['leisure', 'fishing', 'passengers', 'trade', 'oil', 'military'] as const;
export type Use = (typeof USES)[number];

export interface SeaPlace {
	id: string;
	type: PlaceType;
	name: string | null;
	/** The nearest named locality, worked out by Vigie (most slipways and anchorages have no name of their own). */
	near: string | null;
	commune: string | null;
	lat: number;
	lon: number;
	/** From the point asked about, when one was (nearest first). */
	distanceKm: number | null;
	uses: Use[] | null;
	quality: Quality | null;
}

export interface SeaPlaceList {
	count: number;
	returned: number;
	limit: number;
	offset: number;
	byType: Record<PlaceType, number>;
	places: SeaPlace[];
	/** When the file was built (UTC epoch seconds). */
	built: number | null;
	note: string | null;
	licence: string | null;
	attribution: string | null;
}

export interface SeaPlaceAnswer {
	place: SeaPlace;
	built: number | null;
	note: string | null;
	licence: string | null;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The address of a place, `<type>-<words>-<4 hex>`: this is the whole of what a visitor's address may hold. */
export const PLACE_ID =
	/^(port|slipway|anchorage|dive|bathing)-[a-z0-9-]{0,100}-[0-9a-f]{4}$|^(port|slipway|anchorage|dive|bathing)-[0-9a-f]{4}$/;

export function isPlaceId(id: string): boolean {
	return id.length <= 120 && PLACE_ID.test(id);
}

export function isPlaceType(value: unknown): value is PlaceType {
	return PLACE_TYPES.includes(value as PlaceType);
}

export function placeFromApi(raw: unknown): SeaPlace | null {
	const p = obj(raw);
	const id = str(p.id);
	const lat = num(p.lat);
	const lon = num(p.lon);
	if (!id || !isPlaceType(p.type) || lat == null || lon == null) return null;
	const uses = list(p.uses).filter((u): u is Use => USES.includes(u as Use));
	return {
		id,
		type: p.type,
		name: str(p.name),
		near: str(p.near),
		commune: str(p.commune),
		lat,
		lon,
		distanceKm: num(p.distance_km),
		uses: Array.isArray(p.uses) ? uses : null,
		quality: QUALITIES.includes(p.quality as Quality) ? (p.quality as Quality) : null
	};
}

function readTime(v: unknown): number | null {
	const text = str(v);
	if (!text) return null;
	const ms = Date.parse(text);
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function placeListFromApi(raw: unknown): SeaPlaceList | null {
	const body = obj(raw);
	if (!Array.isArray(body.places)) return null;
	const by = obj(body.by_type);
	const byType = Object.fromEntries(PLACE_TYPES.map((t) => [t, num(by[t]) ?? 0])) as Record<
		PlaceType,
		number
	>;
	const places = body.places.map(placeFromApi).filter((p): p is SeaPlace => p != null);
	return {
		count: num(body.count) ?? places.length,
		returned: places.length,
		limit: num(body.limit) ?? places.length,
		offset: num(body.offset) ?? 0,
		byType,
		places,
		built: readTime(body.built_utc),
		note: str(body.note),
		licence: str(body.licence),
		attribution: str(body.attribution)
	};
}

export function placeAnswerFromApi(raw: unknown): SeaPlaceAnswer | null {
	const body = obj(raw);
	const place = placeFromApi(body.place);
	if (!place) return null;
	return {
		place,
		built: readTime(body.built_utc),
		note: str(body.note),
		licence: str(body.licence),
		attribution: str(body.attribution)
	};
}

/** A place has a name of its own, which a search engine can show: the others ("slipway near Saint-Malo") are not worth a result. */
export const hasName = (place: SeaPlace): boolean => place.name != null;

/** What can be asked of the catalogue: any of these, none of them required. */
export interface PlacesQuery {
	types?: readonly PlaceType[];
	/** Nearest first, within `radiusKm`. The position is rounded to 0.01 degree (about a kilometre) before it goes anywhere. */
	near?: { lat: number; lon: number; radiusKm: number };
	/** A word of the name, of the nearest locality or of the commune. */
	q?: string | null;
	limit?: number;
	offset?: number;
}

export const MAX_Q = 80;
export const MAX_PAGE = 500;
export const MAX_RADIUS_KM = 200;

/**
 * The query string of the API for a question, always in the same order and spelling, so that it is also the key of the cache:
 * two visitors who ask the same thing share one request. A made-up value is brought back within the limits of the API rather
 * than passed on.
 */
export function placesQueryString(query: PlacesQuery): string {
	const parts: [string, string][] = [];
	for (const type of [...new Set(query.types ?? [])].filter(isPlaceType).sort()) parts.push(['type', type]);
	const near = query.near;
	if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
		const round = (v: number) => (Math.round(v * 100) / 100 + 0).toFixed(2);
		parts.push(['near_lat', round(Math.min(90, Math.max(-90, near.lat)))]);
		parts.push(['near_lon', round(Math.min(180, Math.max(-180, near.lon)))]);
		const radius = Math.round(Number.isFinite(near.radiusKm) ? near.radiusKm : 25);
		parts.push(['radius_km', String(Math.min(MAX_RADIUS_KM, Math.max(1, radius)))]);
	}
	const q = (query.q ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q).trim();
	if (q) parts.push(['q', q]);
	parts.push(['limit', String(Math.min(MAX_PAGE, Math.max(1, Math.round(query.limit ?? 50))))]);
	const offset = Math.max(0, Math.round(query.offset ?? 0));
	if (offset) parts.push(['offset', String(offset)]);
	return parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/**
 * The ids of every place that has a name, read page by page (`readPage` asks the API): the pages worth a search result. Nothing
 * partial is returned: a page that cannot be read ends the whole reading with its error, so that a sitemap is never cut short.
 */
export async function collectNamedIds(
	readPage: (type: PlaceType, offset: number) => Promise<SeaPlaceList>
): Promise<string[]> {
	const ids: string[] = [];
	for (const type of PLACE_TYPES) {
		let offset = 0;
		for (;;) {
			const page = await readPage(type, offset);
			for (const place of page.places) if (hasName(place) && place.type === type) ids.push(place.id);
			offset += page.returned;
			// An empty page, or the last one: the count is the API's, the guard keeps a wrong one from looping.
			if (page.returned === 0 || offset >= page.count) break;
		}
	}
	return ids;
}

/**
 * The places grouped by type, in the order of `PLACE_TYPES`, each group keeping its order (nearest first when the API gave
 * distances), at most `perType` of each; the place `except` is left out (a page does not list itself).
 */
export function groupByType(
	places: SeaPlace[],
	perType: number,
	except: string | null = null
): { type: PlaceType; places: SeaPlace[]; more: number }[] {
	const groups: { type: PlaceType; places: SeaPlace[]; more: number }[] = [];
	for (const type of PLACE_TYPES) {
		const all = places.filter((p) => p.type === type && p.id !== except);
		if (all.length)
			groups.push({ type, places: all.slice(0, perType), more: Math.max(0, all.length - perType) });
	}
	return groups;
}

/** A link to the place on OpenStreetMap, the map its position comes from: the one third-party address of a place page. */
export function osmLink(place: Pick<SeaPlace, 'lat' | 'lon'>): string {
	const f = (v: number) => (Math.round(v * 1e5) / 1e5).toFixed(5);
	return `https://www.openstreetmap.org/?mlat=${f(place.lat)}&mlon=${f(place.lon)}#map=16/${f(place.lat)}/${f(place.lon)}`;
}

/** The spots the verdicts are about count as "around a place" within this distance (about an hour by road); farther, the page says
 *  that nothing is judged near the place and names the nearest spot with its distance. */
export const PLACE_KM = 60;

/** Of the rows of an activity ranked from a place: the ones within `radius` km (best verdict first, as ranked), and the nearest of all. */
export function spotsAround(
	rows: SeaRow[],
	radius: number = PLACE_KM
): { within: SeaRow[]; nearest: SeaRow | null } {
	const known = rows.filter((r) => r.km != null);
	const nearest = known.reduce<SeaRow | null>(
		(best, r) => (best == null || (r.km ?? 0) < (best.km ?? 0) ? r : best),
		null
	);
	return { within: known.filter((r) => (r.km ?? Infinity) <= radius), nearest };
}

/** How far around a place the other places are looked for: the rare kinds (ports, anchorages, dive sites) farther than the common
 *  ones (slipways, bathing sites), which are many in a town. */
export const NEARBY_KM = { rare: 25, common: 10 } as const;
