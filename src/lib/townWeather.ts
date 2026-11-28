// The weather of the towns of the home map (the "Weather" family of its rail): what the site's server reads from the API's
// `/v1/points` (ADR 0047 of vigie-api) for the towns the base map names in view, and what the map draws of it, a pill per town as
// in the sketch chosen on 2026-11-28: the icon of the sky and the temperature; a drop and the millimetres when it rains in the
// next 3 hours; the gust when it is strong. The page chooses the moment shown (now, a coming hour, tomorrow, a later day). Pure
// functions, shared by the server and the page; the drawings and colours are those of the Home Assistant card (`widget/board`).
import { snapToGrid } from './near';
import { pointFromApi } from './transform';
import type { HourlyWeatherPoint, PointWeather } from './types';
import { atNight, wmoKind } from './widget/board';
import type { IconKind } from './widget/familyIcons';

/** Towns asked in one request: the API's limit. */
export const TOWNS_PER_REQUEST = 40;
/** Hours of forecast kept for each town: enough for tomorrow afternoon at any hour of today. */
export const TOWN_HOURS = 40;
/** Days of forecast kept for each town: today and the next three. */
export const TOWN_DAYS = 4;
/** Below this zoom the base map names countries, not towns: no pill. */
export const TOWNS_MIN_ZOOM = 3;
/** The rain of the next 3 hours (or of the day) from which a pill shows its drop, mm. */
export const RAIN_SHOWN_MM = 0.2;
/** The gust, or the mean wind, from which a pill shows the wind, km/h. */
export const GUST_SHOWN_KMH = 45;
export const WIND_SHOWN_KMH = 30;

/** The fields of an hour that a pill and a town's card read. */
export type TownHour = Pick<
	HourlyWeatherPoint,
	| 't'
	| 'tempC'
	| 'feelsLikeC'
	| 'precipMm'
	| 'precipProbPct'
	| 'windKmh'
	| 'windGustKmh'
	| 'windDeg'
	| 'cloudCoverPct'
	| 'weatherCode'
	| 'isDay'
>;

/** The weather of a town as the server sends it: the cell asked, its offset, now, the rain of the hour, the hours and the days. */
export interface TownWeather {
	lat: number;
	lon: number;
	utcOffsetS: number | null;
	provider: string | null;
	current: PointWeather['current'];
	rain: PointWeather['rain'];
	daily: PointWeather['daily'];
	hourly: TownHour[];
}

/** The answer of `/data/towns.json`: for each cell asked, in order, its weather (null: not read). */
export interface TownsAnswer {
	towns: { lat: number; lon: number; weather: TownWeather | null }[];
	attribution: string | null;
	/** Some cells were not asked of the API: the site's share of the day is used up. */
	paused: boolean;
}

const HOUR_KEYS = [
	't',
	'tempC',
	'feelsLikeC',
	'precipMm',
	'precipProbPct',
	'windKmh',
	'windGustKmh',
	'windDeg',
	'cloudCoverPct',
	'weatherCode',
	'isDay'
] as const satisfies readonly (keyof TownHour)[];

/** A cell of the weather grid as a key: the same string on the server and in the page. */
export const cellKey = (p: { lat: number; lon: number }) => {
	const c = snapToGrid(p);
	return `${c.lat},${c.lon}`;
};

/** The places of the API's `/v1/points`, read with the same rules as `/v1/point`: null for a place without weather. */
export function townsFromApi(body: unknown): { places: (TownWeather | null)[]; attribution: string | null } {
	const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
	const places = (Array.isArray(b.places) ? b.places : []).map((raw): TownWeather | null => {
		const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
		const w = pointFromApi({ ...p, coordinates: { lat: p.lat, lon: p.lon } });
		if (!w.current || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return null;
		return {
			lat: w.lat,
			lon: w.lon,
			utcOffsetS: w.utcOffsetS,
			provider: w.provider,
			current: w.current,
			rain: w.rain,
			daily: w.daily.slice(0, TOWN_DAYS),
			hourly: (w.hourly ?? []).slice(0, TOWN_HOURS).map((h) => {
				const out = {} as Record<string, unknown>;
				for (const k of HOUR_KEYS) out[k] = h[k];
				return out as unknown as TownHour;
			})
		};
	});
	return { places, attribution: typeof b.attribution === 'string' ? b.attribution : null };
}

/** A town's weather as the whole reading of a point, for the helpers of the card (`widget/board`): the other blocks empty. */
export function asPoint(t: TownWeather): PointWeather {
	return {
		lat: t.lat,
		lon: t.lon,
		generated: null,
		utcOffsetS: t.utcOffsetS,
		provider: t.provider,
		fallback: false,
		attribution: null,
		current: t.current,
		daily: t.daily,
		rain: t.rain,
		shortTerm: null,
		probabilities: null,
		air: null,
		river: null,
		marine: null,
		space: null,
		fires: null,
		drought: null,
		hourly: t.hourly.map((h) => ({
			dewPointC: null,
			cloudLowPct: null,
			cloudMidPct: null,
			cloudHighPct: null,
			pressureHpa: null,
			uvIndex: null,
			shortwaveWm2: null,
			...h
		})),
		disclaimer: null
	};
}

// --- the moments of the bar under the map ---------------------------------------------------------------------------------------

/**
 * A moment the pills show: now; a coming hour (the same instant everywhere); an hour of tomorrow at each town's own clock; a day
 * after tomorrow (`days` from today, by each town's date).
 */
export type Moment =
	| { kind: 'now' }
	| { kind: 'hour'; t: number }
	| { kind: 'local'; days: number; hour: number }
	| { kind: 'day'; days: number };

/** The moments of the bar: now, in 3, 6 and 9 hours, tomorrow at 8 and 14 h, the two days after. */
export function moments(nowS: number): Moment[] {
	const next = nowS - (nowS % 3600) + 3600;
	return [
		{ kind: 'now' },
		...[2, 5, 8].map((k): Moment => ({ kind: 'hour', t: next + k * 3600 })),
		{ kind: 'local', days: 1, hour: 8 },
		{ kind: 'local', days: 1, hour: 14 },
		{ kind: 'day', days: 2 },
		{ kind: 'day', days: 3 }
	];
}

/** The place's own date of an instant. */
const localDay = (t: number, offsetS: number) => new Date((t + offsetS) * 1000).toISOString().slice(0, 10);

/** What a pill shows of a town at a moment; null when the town's forecast does not reach it. */
export interface TownReading {
	kind: IconKind | null;
	temp: number | null;
	/** The lowest of the day, for a day only. */
	tempMin: number | null;
	/** The rain of the 3 hours from the moment (of the day for a day), mm. */
	rainMm: number;
	/** The wind shown (the strongest gust, else the mean wind), km/h; null when it is not strong. */
	wind: number | null;
	/** Where the wind comes from, degrees. */
	windDeg: number | null;
	day: boolean;
}

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const sumOf = (hours: TownHour[]) => hours.reduce((a, h) => a + (finite(h.precipMm) ? h.precipMm : 0), 0);
const maxOf = (values: (number | null)[]) => {
	const v = values.filter(finite);
	return v.length ? Math.max(...v) : null;
};
const strong = (gust: number | null, wind: number | null) =>
	(gust ?? 0) >= GUST_SHOWN_KMH || (wind ?? 0) >= WIND_SHOWN_KMH ? (gust ?? wind) : null;

/** The instant of a moment at a town (the start of its hour); null for a day. */
export function momentTime(m: Moment, nowS: number, offsetS: number | null): number | null {
	if (m.kind === 'now') return nowS - (nowS % 3600);
	if (m.kind === 'hour') return m.t;
	if (m.kind === 'day') return null;
	const off = offsetS ?? 0;
	const midnight = Math.floor((nowS + off) / 86_400) * 86_400 - off;
	return midnight + m.days * 86_400 + m.hour * 3600;
}

/** What a town shows at a moment. */
export function readAt(t: TownWeather, m: Moment, nowS: number): TownReading | null {
	const off = t.utcOffsetS ?? 0;
	if (m.kind === 'day') {
		const date = localDay(nowS + m.days * 86_400, off);
		const d = t.daily.find((x) => x.date === date);
		if (!d || !finite(d.tmaxC)) return null;
		return {
			kind: wmoKind(d.code),
			temp: d.tmaxC,
			tempMin: d.tminC,
			rainMm: d.rainMm ?? 0,
			wind: finite(d.windMaxKmh) && d.windMaxKmh >= WIND_SHOWN_KMH ? d.windMaxKmh : null,
			windDeg: null,
			day: true
		};
	}
	const at = momentTime(m, nowS, t.utcOffsetS) as number;
	const i = t.hourly.findIndex((h) => h.t <= at && at < h.t + 3600);
	const hour = i >= 0 ? t.hourly[i] : null;
	const next3 = i >= 0 ? t.hourly.slice(i, i + 3) : [];
	if (m.kind === 'now') {
		const c = t.current;
		const day = hour?.isDay !== false;
		const temp = c?.tempC ?? hour?.tempC ?? null;
		if (!finite(temp)) return null;
		return {
			kind: atNight(wmoKind(c?.code ?? hour?.weatherCode), day),
			temp,
			tempMin: null,
			rainMm: sumOf(next3),
			wind: strong(c?.gustKmh ?? hour?.windGustKmh ?? null, c?.windKmh ?? hour?.windKmh ?? null),
			windDeg: c?.windDeg ?? hour?.windDeg ?? null,
			day
		};
	}
	if (!hour || !finite(hour.tempC)) return null;
	const day = hour.isDay !== false;
	return {
		kind: atNight(wmoKind(hour.weatherCode), day),
		temp: hour.tempC,
		tempMin: null,
		rainMm: sumOf(next3),
		wind: strong(maxOf(next3.map((h) => h.windGustKmh)), maxOf(next3.map((h) => h.windKmh))),
		windDeg: hour.windDeg,
		day
	};
}

/** Whether a pill shows its drop. */
export const rainShown = (r: TownReading) => r.rainMm >= RAIN_SHOWN_MM;
