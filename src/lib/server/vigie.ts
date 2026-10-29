// The only place that talks to the Vigie API. Every call goes through the cache: the number of requests
// to the API depends on the number of distinct keys and on the TTLs, not on the number of visitors.
import { VIGIE_API_URL, VIGIE_POINT_LOOKUPS_PER_DAY } from '$app/env/private';
import { tileBox, type FireLevel } from '#lib/fires.js';
import { hasBox } from '#lib/geo.js';
import { snapToGrid } from '#lib/near.js';
import {
	eclipseFromApi,
	eclipseListFromApi,
	eclipseMapFromApi,
	type Eclipse,
	type EclipseList
} from '#lib/eclipse.js';
import { eventsFromApi, type WorldEvents } from '#lib/events.js';
import { auroraFromApi, ovalFromApi, type Aurora } from '#lib/sky.js';
import { surfForecastFromApi, surfSpotsFromApi, type SurfForecast, type SurfSpots } from '#lib/surf.js';
import {
	tideTileBox,
	tideTileFromApi,
	tidesFromApi,
	type TideCurve,
	type TideLevel,
	type TideTile
} from '#lib/tides.js';
import {
	countryFromApi,
	healthFromApi,
	overviewFromApi,
	type CountryDetail,
	type Health,
	type Overview
} from '#lib/travel.js';
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
	// The world in events reads every served country: kept 5 minutes, and served old while it is read again.
	events: 300,
	warnings: 120,
	providers: 60,
	point: 900,
	forecast: 300,
	served: 600,
	fires: 600,
	// The API keeps NOAA's aurora files 5 minutes (the Kp forecast 15); a place's estimate changes with them and the clouds.
	aurora: 300,
	auroraPlace: 900,
	// NASA's eclipses are bundled in the API: they change with a new version of it only. A place's eclipse changes only
	// when the clouds come in, 48 hours before.
	eclipses: 86_400,
	eclipsePlace: 3600,
	eclipseSoon: 900,
	// The tide is computed by the API (no provider): the curve of a point is kept 10 minutes, the coast 5 (its "now").
	tides: 600,
	tideCoast: 300,
	// The API reads each ministry and the ECDC at most once an hour.
	travel: 600,
	// The spots are bundled in the API (they change with a new version of it); a spot's forecast is kept 10 minutes by the API.
	surfSpots: 86_400,
	surf: 600
} as const;

const cache = new TtlCache();
// Points have their own cache, so that many places cannot push the shared answers out. So do the tiles of fires.
const pointCache = new TtlCache(Date.now, 15_000, 2000);
const fireCache = new TtlCache(Date.now, 15_000, 400);
const tideCache = new TtlCache(Date.now, 15_000, 2000);

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

// A world view asks every source the API serves: the first one after a quiet spell can take a minute.
const EVENTS_TIMEOUT_MS = 90_000;

/** The world in events (compact: without the alerts themselves). */
export function getEvents(): Promise<Cached<WorldEvents>> {
	return cache.get('events', TTL_S.events * 1000, async () =>
		eventsFromApi(await getJson('/v1/events?compact=true', EVENTS_TIMEOUT_MS))
	);
}

/** The last world view at once, a new reading started behind it when it is old; null before the first one. The
 *  home page never waits for the API's world view. */
export function eventsNow(): Cached<WorldEvents> | null {
	const last = cache.peek<WorldEvents>('events');
	getEvents().catch(() => {});
	return last;
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

/** NOAA's aurora data as the API relays it, without a place (one answer for every visitor). */
export function getAurora(): Promise<Cached<Aurora>> {
	return cache.get('aurora', TTL_S.aurora * 1000, async () =>
		auroraFromApi(await getJson('/v1/sky/aurora', 30_000))
	);
}

/** NOAA's OVATION oval as map bands. */
export function getAuroraOval(): Promise<Cached<ReturnType<typeof ovalFromApi>>> {
	return cache.get('aurora:oval', TTL_S.aurora * 1000, async () =>
		ovalFromApi(await getJson('/v1/sky/aurora.geojson', 30_000))
	);
}

/**
 * The aurora estimate of the coming night at the grid point nearest to a position. It costs the API at most the daily
 * forecast request of that point (shared with the weather), so it counts against the same daily share.
 */
export function getAuroraPlace(lat: number, lon: number): Promise<Cached<Aurora>> {
	const cell = snapToGrid({ lat, lon });
	return pointCache.get(`aurora:${cell.lat},${cell.lon}`, TTL_S.auroraPlace * 1000, async () => {
		if (!budget().take()) throw new BudgetError('The weather requests of the day are used up');
		const query = new URLSearchParams({ lat: String(cell.lat), lon: String(cell.lon) });
		return auroraFromApi(await getJson(`/v1/sky/aurora?${query}`, 30_000));
	});
}

/** NASA's solar eclipses of the next ten years, as the API gives them (one answer for every visitor). */
export function getEclipses(): Promise<Cached<EclipseList>> {
	return cache.get('eclipses', TTL_S.eclipses * 1000, async () =>
		eclipseListFromApi(await getJson('/v1/sky/eclipses', 30_000))
	);
}

/** The map of one eclipse (bands, path, central line), drawn by the API; the same for every visitor. */
export function getEclipseMap(date: string): Promise<Cached<ReturnType<typeof eclipseMapFromApi>>> {
	return cache.get(`eclipse:map:${date}`, TTL_S.eclipses * 1000, async () =>
		eclipseMapFromApi(await getJson(`/v1/sky/eclipses/${date}.geojson`, 60_000))
	);
}

/** Whether an eclipse is close enough for the API to ask the clouds (48 hours; a day of margin for the time). */
export function eclipseSoon(date: string, now = Date.now()): boolean {
	return Math.abs(Date.parse(`${date}T12:00:00Z`) - now) < 3 * 86_400_000;
}

/**
 * One eclipse seen from a position rounded to 0.01 degree (about a kilometre: the edge of the path is that sharp).
 * The API works it out without a request, except for the clouds in the 48 hours before: only then does it count
 * against the daily share of weather requests.
 */
export function getEclipsePlace(date: string, lat: number, lon: number): Promise<Cached<Eclipse>> {
	const at = { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
	const soon = eclipseSoon(date);
	return pointCache.get(
		`eclipse:${date}:${at.lat},${at.lon}`,
		(soon ? TTL_S.eclipseSoon : TTL_S.eclipsePlace) * 1000,
		async () => {
			if (soon && !budget().take()) throw new BudgetError('The weather requests of the day are used up');
			const query = new URLSearchParams({ lat: String(at.lat), lon: String(at.lon) });
			const eclipse = eclipseFromApi(await getJson(`/v1/sky/eclipses/${date}?${query}`, 30_000));
			if (!eclipse) throw new ApiError(`Vigie API gave no eclipse for ${date}`, null);
			return eclipse;
		}
	);
}

/**
 * The tide at a coastal point, computed by the API from a tide model: two days from the current hour, every 15 minutes. The
 * position is rounded to 0.05 degree (the model's cells are 1/8 degree); null where the model has no cell near (inland).
 */
export async function getTides(lat: number, lon: number): Promise<Cached<TideCurve> | null> {
	const rlat = Math.round(lat * 20) / 20;
	const rlon = Math.round(lon * 20) / 20;
	try {
		return await tideCache.get(`tides:${rlat},${rlon}`, TTL_S.tides * 1000, async () =>
			tidesFromApi(await getJson(`/v1/tides?lat=${rlat}&lon=${rlon}&days=2&interval_minutes=15`, 15_000))
		);
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) return null;
		throw e;
	}
}

/** One tile of the tide now along the coasts ($lib/tides). */
export function getTideTile(level: TideLevel, x: number, y: number): Promise<Cached<TideTile>> {
	return tideCache.get(`tidecoast:${level.id}:${x}_${y}`, TTL_S.tideCoast * 1000, async () => {
		const bbox = tideTileBox(level, x, y).join(',');
		return tideTileFromApi(await getJson(`/v1/tides/coast?bbox=${bbox}&limit=${level.limit}`, 15_000));
	});
}

/** Every ministry's level for each country (`/v1/travel`): one answer for every visitor. */
export function getTravel(): Promise<Cached<Overview>> {
	return cache.get('travel', TTL_S.travel * 1000, async () =>
		overviewFromApi(await getJson('/v1/travel', 30_000))
	);
}

/** One country's advices, texts, comparison, archive and health items; null for a code the API refuses. */
export async function getTravelCountry(country: string): Promise<Cached<CountryDetail | null> | null> {
	const cc = country.toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc)) return null;
	try {
		return await cache.get(`travel:${cc}`, TTL_S.travel * 1000, async () =>
			countryFromApi(await getJson(`/v1/travel/${cc}`, 30_000))
		);
	} catch (e) {
		if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return null;
		throw e;
	}
}

/** The ECDC's recent publications on communicable disease threats (`/v1/travel/health`). */
export function getTravelHealth(): Promise<Cached<Health>> {
	return cache.get('travel:health', TTL_S.travel * 1000, async () =>
		healthFromApi(await getJson('/v1/travel/health', 30_000))
	);
}

/** The surf spots of the API (OpenStreetMap), north to south. */
export function getSurfSpots(): Promise<Cached<SurfSpots>> {
	return cache.get('surf-spots', TTL_S.surfSpots * 1000, async () =>
		surfSpotsFromApi(await getJson('/v1/surf/spots', 15_000))
	);
}

/** The forecast of a spot for the next three days; null for a spot the API does not know. */
export async function getSurfForecast(id: string): Promise<Cached<SurfForecast> | null> {
	if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
	try {
		return await pointCache.get(`surf:${id}`, TTL_S.surf * 1000, async () => {
			const forecast = surfForecastFromApi(await getJson(`/v1/surf/spots/${id}?days=3`, 30_000));
			if (!forecast) throw new ApiError(`Vigie API gave no surf forecast for ${id}`, null);
			return forecast;
		});
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) return null;
		throw e;
	}
}

/** Cache-Control for an answer built from data kept `ttl` seconds: browsers keep it half as long. */
export function cacheHeaders(ttl: number): Record<string, string> {
	return {
		'cache-control': `public, max-age=${Math.round(ttl / 2)}, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`
	};
}
