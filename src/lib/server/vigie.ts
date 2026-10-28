// The only place that talks to the Vigie API. Every call goes through the cache: the number of requests
// to the API depends on the number of distinct keys and on the TTLs, not on the number of visitors.
import { VIGIE_API_URL, VIGIE_POINT_LOOKUPS_PER_DAY } from '$app/env/private';
import { tileBox, type FireLevel } from '#lib/fires.js';
import { hasBox } from '#lib/geo.js';
import { snapToGrid } from '#lib/near.js';
import {
	firesFromApi,
	forecastFromApi,
	hazardsFromApi,
	pointFromApi,
	servedFromApi,
	uncoveredFromApi,
	warningsFromApi,
	type ParsedWarnings
} from '#lib/transform.js';
import type {
	FireTile,
	HazardForecast,
	HazardsData,
	PointWeather,
	Provider,
	ServedCountry,
	UncoveredCountry
} from '#lib/types.js';
import { SlidingBudget } from './budget';
import { TtlCache, type Cached } from './cache';

/** Seconds each kind of answer is kept. The API caches its sources itself; this only spares it. */
// A point's weather: the API's forecast changes every 15 minutes at most.
// A forecast changes with a new advisory (every 3 to 6 hours for a storm) or a new tsunami message.
// The countries served change with the API's settings only.
// The API reads the fires at most every 60 minutes.
export const TTL_S = {
	hazards: 60,
	warnings: 120,
	providers: 60,
	point: 900,
	forecast: 300,
	served: 600,
	fires: 600
} as const;

const cache = new TtlCache();
// Points have their own cache, so that many places cannot push the shared answers out. So do the tiles of fires.
const pointCache = new TtlCache(Date.now, 15_000, 2000);
const fireCache = new TtlCache(Date.now, 15_000, 400);

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number | null
	) {
		super(message);
	}
}

function apiUrl(path: string): string {
	const base = (VIGIE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
	return base + path;
}

async function getJson(path: string, timeoutMs = 60_000): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(apiUrl(path), {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(timeoutMs)
		});
	} catch (error) {
		throw new ApiError(`Vigie API unreachable (${(error as Error).name})`, null);
	}
	if (!response.ok) throw new ApiError(`Vigie API answered ${response.status} for ${path}`, response.status);
	return response.json();
}

export function getHazards(): Promise<Cached<HazardsData>> {
	return cache.get('hazards', TTL_S.hazards * 1000, async () =>
		hazardsFromApi(await getJson('/v1/geojson/hazards'))
	);
}

/** The countries the API serves official warnings for. */
export async function getServed(): Promise<Cached<ServedCountry[]>> {
	const answer = await getCountries();
	return { ...answer, value: answer.value.served };
}

/** The countries the API reads no source for, and why (an API older than vigie-api 9da278c lists none). */
export async function getUncovered(): Promise<Cached<UncoveredCountry[]>> {
	const answer = await getCountries();
	return { ...answer, value: answer.value.uncovered };
}

// One request gives both lists: with ?uncovered=true the served countries keep their form, the others say why.
function getCountries(): Promise<Cached<{ served: ServedCountry[]; uncovered: UncoveredCountry[] }>> {
	return cache.get('served', TTL_S.served * 1000, async () => {
		const body = await getJson('/v1/vigilances/countries?uncovered=true', 15_000);
		return { served: servedFromApi(body), uncovered: uncoveredFromApi(body) };
	});
}

/** The codes of the served countries; an empty list when the API cannot tell (the map then loads none). */
export async function servedCodes(): Promise<string[]> {
	try {
		return (await getServed()).value.map((c) => c.country);
	} catch (e) {
		if (e instanceof ApiError) return [];
		throw e;
	}
}

/** Whether the API serves this country. When the API cannot tell, any country it has a border for may be,
 *  and its page says that the source does not answer. */
export async function isServed(cc: string): Promise<boolean> {
	if (!/^[A-Z]{2}$/.test(cc)) return false;
	try {
		return (await getServed()).value.some((c) => c.country === cc);
	} catch (e) {
		if (e instanceof ApiError) return hasBox(cc);
		throw e;
	}
}

/** Warnings of one served country; null for a country with no source. */
export async function getWarnings(country: string): Promise<Cached<ParsedWarnings> | null> {
	const cc = country.toUpperCase();

	if (!(await isServed(cc))) return null;

	return cache.get(`warnings:${cc}`, TTL_S.warnings * 1000, async () =>
		warningsFromApi(cc, await getJson(`/v1/vigilances.geojson?country=${cc}`))
	);
}

export function getProviders(): Promise<Cached<Provider[]>> {
	return cache.get('providers', TTL_S.providers * 1000, async () => {
		const body = await getJson('/v1/providers', 15_000);
		return (Array.isArray(body) ? body : []) as Provider[];
	});
}

/** The forecast of a hazard that has one; null when the API does not know the hazard (any more). */
export async function getForecast(id: string): Promise<Cached<HazardForecast> | null> {
	if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) return null;
	try {
		return await cache.get(`forecast:${id}`, TTL_S.forecast * 1000, async () =>
			forecastFromApi(id, await getJson(`/v1/geojson/hazards/${encodeURIComponent(id)}/forecast`, 30_000))
		);
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) return null;
		throw e;
	}
}

/** The tsunami messages in force (U.S. warning centres): their areas are codes or country names, never shapes. */
export function getTsunamiWarnings(): Promise<Cached<ParsedWarnings>> {
	return cache.get('warnings:tsunami', TTL_S.warnings * 1000, async () =>
		warningsFromApi('', await getJson('/v1/vigilances.geojson?source=tsunami'))
	);
}

/** The site's daily share of the weather requests (`VIGIE_POINT_LOOKUPS_PER_DAY`, 0 turns the weather off). */
let pointBudget: SlidingBudget | null = null;
function budget(): SlidingBudget {
	if (!pointBudget) {
		const value = Number(VIGIE_POINT_LOOKUPS_PER_DAY || 200);
		pointBudget = new SlidingBudget(Number.isFinite(value) && value >= 0 ? Math.floor(value) : 200);
	}
	return pointBudget;
}

/** The weather requests of the last 24 hours are used up: the page says so instead of asking. */
export class BudgetError extends Error {}

/**
 * Weather at the grid point nearest to a position. A request that is not in the cache counts against the
 * site's daily share, whether or not the API had the answer in its own cache: the count stays on the safe side.
 */
export function getPoint(lat: number, lon: number, marine: boolean): Promise<Cached<PointWeather>> {
	const cell = snapToGrid({ lat, lon });
	const key = `point:${cell.lat},${cell.lon}:${marine ? 'marine' : 'land'}`;
	return pointCache.get(key, TTL_S.point * 1000, async () => {
		if (!budget().take()) throw new BudgetError('The weather requests of the day are used up');
		const query = new URLSearchParams({
			lat: String(cell.lat),
			lon: String(cell.lon),
			marine: String(marine),
			device_type: 'web',
			// The page finds the hazards itself; the API wants at least one.
			max_hazards: '1',
			radius_km: '1'
		});
		return pointFromApi(await getJson(`/v1/point?${query}`, 30_000));
	});
}

/**
 * One tile of active fires: the cells of a grid, or the detections themselves (the strongest first). The API
 * answers 404 when it has no fire data (no FIRMS key).
 */
export function getFires(level: FireLevel, x: number, y: number): Promise<Cached<FireTile>> {
	return fireCache.get(`fires:${level.id}:${x}_${y}`, TTL_S.fires * 1000, async () => {
		const bbox = tileBox(level, x, y).join(',');
		const path =
			level.cellDeg == null
				? `/v1/fires?bbox=${bbox}&limit=5000`
				: `/v1/fires/grid?bbox=${bbox}&cell_deg=${level.cellDeg}&limit=20000`;
		return firesFromApi(await getJson(path, 30_000), level.cellDeg == null ? 'dots' : 'cells');
	});
}

/** Cache-Control for an answer built from data kept `ttl` seconds: browsers keep it half as long. */
export function cacheHeaders(ttl: number): Record<string, string> {
	return {
		'cache-control': `public, max-age=${Math.round(ttl / 2)}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`
	};
}
