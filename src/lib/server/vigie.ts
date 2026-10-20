// The only place that talks to the Vigie API. Every call goes through the cache: the number of requests
// to the API depends on the number of distinct keys and on the TTLs, not on the number of visitors.
import { env } from '$env/dynamic/private';
import { isCovered } from '$lib/geo';
import { snapToGrid } from '$lib/near';
import {
	forecastFromApi,
	hazardsFromApi,
	pointFromApi,
	warningsFromApi,
	type ParsedWarnings
} from '$lib/transform';
import type { HazardForecast, HazardsData, PointWeather, Provider } from '$lib/types';
import { SlidingBudget } from './budget';
import { TtlCache, type Cached } from './cache';

/** Seconds each kind of answer is kept. The API caches its sources itself; this only spares it. */
// A point's weather: the API's forecast changes every 15 minutes at most.
// A forecast changes with a new advisory (every 3 to 6 hours for a storm) or a new tsunami message.
export const TTL_S = { hazards: 60, warnings: 120, providers: 60, point: 900, forecast: 300 } as const;

const cache = new TtlCache();
// Points have their own cache, so that many places cannot push the shared answers out.
const pointCache = new TtlCache(Date.now, 15_000, 2000);

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number | null
	) {
		super(message);
	}
}

function apiUrl(path: string): string {
	const base = (env.VIGIE_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
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

/** Warnings of one covered country; null for a country with no source. */
export async function getWarnings(country: string): Promise<Cached<ParsedWarnings> | null> {
	const cc = country.toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc) || !isCovered(cc)) return null;
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
		const value = Number(env.VIGIE_POINT_LOOKUPS_PER_DAY || 200);
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

/** Cache-Control for an answer built from data kept `ttl` seconds: browsers keep it half as long. */
export function cacheHeaders(ttl: number): Record<string, string> {
	return {
		'cache-control': `public, max-age=${Math.round(ttl / 2)}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`
	};
}
