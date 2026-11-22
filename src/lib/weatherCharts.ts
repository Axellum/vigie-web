// Pure helpers for the complementary weather charts (`WeatherCharts.svelte`): tab availability, scales, SVG paths
// that break on missing values, night runs, local day boundaries, barometric trend, WHO UV bands, EEA AQI bands, and
// honest forecast-vs-measured comparison against a nearby ground station or offshore buoy.
// Never fabricates data: any missing series or metric stays null and is left out.
import { distanceKm, type Place } from './near';
import type { AirHourlyPoint, HourlyWeatherPoint, PointWeather, PressureHistoryPoint } from './types';
import type { WindMap } from './wind';

export type WeatherChartTab = 'meteogram' | 'barometer' | 'uv' | 'air' | 'compare';

export interface MeasuredComparison {
	sourceName: string;
	kind: 'station' | 'buoy';
	distanceKm: number;
	altM: number | null;
	measuredUtc: number;
	windKmh: number | null;
	gustKmh: number | null;
	windFromDeg: number | null;
	airTempC: number | null;
	pressureHpa: number | null;
	attribution: string | null;
}

export interface PressureSeriesPoint {
	t: number;
	pressureHpa: number;
	past: boolean;
}

export type PressureTrendKind = 'rising' | 'steady' | 'falling';

export interface PressureTrend {
	kind: PressureTrendKind;
	/** Delta in hPa over the comparison window (positive = rising). */
	deltaHpa: number;
	/** Span in hours used to compute the trend. */
	hours: number;
}

export type UvBand = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';
export type AqiBand = 'good' | 'fair' | 'moderate' | 'poor' | 'very_poor' | 'extremely_poor';

export interface ComparisonRow {
	kind: 'wind' | 'gust' | 'temp' | 'pressure';
	forecast: number;
	measured: number;
	/** Measured minus forecast. */
	diff: number;
}

const HOUR = 3600;

/** Counts finite numeric values extracted from a list. */
export function finiteCount<T>(
	items: readonly T[] | null | undefined,
	pick: (item: T) => number | null | undefined
): number {
	if (!items) return 0;
	let n = 0;
	for (const item of items) {
		const v = pick(item);
		if (v != null && Number.isFinite(v)) n++;
	}
	return n;
}

/** Merges optional past `pressureHistory` and forecast `hourly.pressureHpa` into one chronological series. */
export function mergePressureSeries(
	history: PressureHistoryPoint[] | null | undefined,
	hourly: HourlyWeatherPoint[] | null | undefined,
	nowUtc: number
): PressureSeriesPoint[] {
	const byTime = new Map<number, PressureSeriesPoint>();
	for (const p of history ?? []) {
		if (!Number.isFinite(p.pressureHpa)) continue;
		byTime.set(p.t, { t: p.t, pressureHpa: p.pressureHpa, past: true });
	}
	for (const h of hourly ?? []) {
		if (h.pressureHpa == null || !Number.isFinite(h.pressureHpa)) continue;
		if (!byTime.has(h.t)) {
			byTime.set(h.t, { t: h.t, pressureHpa: h.pressureHpa, past: h.t < nowUtc });
		}
	}
	return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/**
 * Computes an honest barometric pressure trend around `nowUtc` using a ~3h window (or the closest 2–6h span available).
 * Standard meteorological threshold: >= +1.0 hPa / 3h is rising, <= -1.0 hPa / 3h is falling, otherwise steady.
 * Returns null if fewer than two usable samples exist in the window.
 */
export function pressureTrend(series: readonly PressureSeriesPoint[], nowUtc: number): PressureTrend | null {
	if (series.length < 2) return null;
	// Prefer a past-to-now window when history exists; otherwise use the first ~3h of the forecast.
	const pastOrNow = series.filter((p) => p.t <= nowUtc + 1800);
	let a: PressureSeriesPoint | null = null;
	let b: PressureSeriesPoint | null = null;
	if (pastOrNow.length >= 2) {
		b = pastOrNow[pastOrNow.length - 1];
		const target = b.t - 3 * HOUR;
		a = pastOrNow.reduce(
			(best, p) => {
				if (p.t >= b!.t) return best;
				if (!best) return p;
				return Math.abs(p.t - target) < Math.abs(best.t - target) ? p : best;
			},
			null as PressureSeriesPoint | null
		);
	}
	if (!a || !b || b.t - a.t < HOUR) {
		// Fall back to the earliest point and the sample closest to +3h after it.
		a = series[0];
		const target = a.t + 3 * HOUR;
		b = series.slice(1).reduce(
			(best, p) => {
				if (!best) return p;
				return Math.abs(p.t - target) < Math.abs(best.t - target) ? p : best;
			},
			null as PressureSeriesPoint | null
		);
	}
	if (!a || !b || b.t <= a.t) return null;
	const hours = (b.t - a.t) / HOUR;
	if (hours < 1 || hours > 12) return null;
	const deltaHpa = Math.round((b.pressureHpa - a.pressureHpa) * 10) / 10;
	const per3h = (deltaHpa / hours) * 3;
	const kind: PressureTrendKind = per3h >= 1.0 ? 'rising' : per3h <= -1.0 ? 'falling' : 'steady';
	return { kind, deltaHpa, hours: Math.round(hours) };
}

/** WHO UV index classification bands. */
export function uvBand(uv: number): UvBand {
	if (uv >= 11) return 'extreme';
	if (uv >= 8) return 'very_high';
	if (uv >= 6) return 'high';
	if (uv >= 3) return 'moderate';
	return 'low';
}

/** European Air Quality Index (EEA) bands. */
export function aqiBand(eaqi: number): AqiBand {
	if (eaqi >= 100) return 'extremely_poor';
	if (eaqi >= 80) return 'very_poor';
	if (eaqi >= 60) return 'poor';
	if (eaqi >= 40) return 'moderate';
	if (eaqi >= 20) return 'fair';
	return 'good';
}

/** Picks the forecast reference values closest to `nowUtc` (current weather, falling back to nearest hourly point). */
function forecastReference(
	weather: PointWeather,
	nowUtc: number
): {
	windKmh: number | null;
	gustKmh: number | null;
	windDeg: number | null;
	tempC: number | null;
	pressureHpa: number | null;
} {
	const c = weather.current;
	let nearest: HourlyWeatherPoint | null = null;
	for (const h of weather.hourly ?? []) {
		if (!nearest || Math.abs(h.t - nowUtc) < Math.abs(nearest.t - nowUtc)) nearest = h;
	}
	return {
		windKmh: c?.windKmh ?? nearest?.windKmh ?? null,
		gustKmh: c?.gustKmh ?? nearest?.windGustKmh ?? null,
		windDeg: c?.windDeg ?? nearest?.windDeg ?? null,
		tempC: c?.tempC ?? nearest?.tempC ?? null,
		pressureHpa: c?.pressureHpa ?? nearest?.pressureHpa ?? null
	};
}

/** Honest comparison rows where BOTH forecast and measured values exist. Never invents missing metrics. */
export function compareMetrics(
	weather: PointWeather,
	measured: MeasuredComparison | null | undefined,
	nowUtc: number
): ComparisonRow[] {
	if (!measured) return [];
	const ref = forecastReference(weather, nowUtc);
	const rows: ComparisonRow[] = [];
	const push = (kind: ComparisonRow['kind'], forecast: number | null, obs: number | null) => {
		if (forecast == null || obs == null || !Number.isFinite(forecast) || !Number.isFinite(obs)) return;
		rows.push({ kind, forecast, measured: obs, diff: Math.round((obs - forecast) * 10) / 10 });
	};
	push('wind', ref.windKmh, measured.windKmh);
	push('gust', ref.gustKmh, measured.gustKmh);
	push('temp', ref.tempC, measured.airTempC);
	push('pressure', ref.pressureHpa, measured.pressureHpa);
	return rows;
}

/** Shortest angular difference in degrees (0..180) between forecast and measured wind directions, or null. */
export function directionGapDeg(forecastDeg: number | null, measuredDeg: number | null): number | null {
	if (forecastDeg == null || measuredDeg == null) return null;
	const raw = Math.abs(((measuredDeg - forecastDeg + 540) % 360) - 180);
	return Math.round(raw);
}

/** Returns ONLY the chart tabs that have real non-null API data to display. */
export function availableTabs(
	weather: PointWeather,
	measured: MeasuredComparison | null | undefined,
	nowUtc: number
): WeatherChartTab[] {
	const tabs: WeatherChartTab[] = [];
	const hourly = weather.hourly ?? [];
	const hasMeteogram =
		finiteCount(hourly, (h) => h.tempC) >= 2 ||
		finiteCount(hourly, (h) => h.precipMm) >= 2 ||
		finiteCount(hourly, (h) => h.windKmh) >= 2 ||
		finiteCount(hourly, (h) => h.cloudCoverPct) >= 2;
	if (hasMeteogram) tabs.push('meteogram');

	if (mergePressureSeries(weather.pressureHistory, weather.hourly, nowUtc).length >= 2) {
		tabs.push('barometer');
	}

	const hasUvSolar =
		finiteCount(hourly, (h) => h.uvIndex) >= 2 || finiteCount(hourly, (h) => h.shortwaveWm2) >= 2;
	if (hasUvSolar) tabs.push('uv');

	const air = weather.airHourly ?? [];
	const hasAir =
		finiteCount(air, (a) => a.pm25) >= 2 ||
		finiteCount(air, (a) => a.pm10) >= 2 ||
		finiteCount(air, (a) => a.ozone) >= 2 ||
		finiteCount(air, (a) => a.nitrogenDioxide) >= 2 ||
		finiteCount(air, (a) => a.dust) >= 2 ||
		finiteCount(air, (a) => a.europeanAqi) >= 2;
	if (hasAir) tabs.push('air');

	if (compareMetrics(weather, measured, nowUtc).length > 0) {
		tabs.push('compare');
	}
	return tabs;
}

/** Day key (`YYYY-MM-DD`) in the place's local time using `utcOffsetS` (0 when unknown). */
export function localDayKey(t: number, utcOffsetS: number | null): string {
	const ms = (t + (utcOffsetS ?? 0)) * 1000;
	return new Date(ms).toISOString().slice(0, 10);
}

/** Formats a day header (`mar. 24` / `Tue 24`) using the place's local calendar date. */
export function localDayLabel(lang: 'fr' | 'en', t: number, utcOffsetS: number | null): string {
	const iso = localDayKey(t, utcOffsetS);
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		weekday: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${iso}T12:00:00Z`));
}

/** Computes contiguous night spans (`isDay === false`) in epoch seconds. */
export function nightRuns(hourly: readonly HourlyWeatherPoint[]): { from: number; to: number }[] {
	const runs: { from: number; to: number }[] = [];
	for (const h of hourly) {
		if (h.isDay !== false) continue;
		const last = runs.at(-1);
		if (last && last.to === h.t) last.to = h.t + HOUR;
		else runs.push({ from: h.t, to: h.t + HOUR });
	}
	return runs;
}

/** Builds an SVG polyline path (`M...L...`) through valid points, breaking cleanly on null gaps. */
export function polylinePath<T>(
	items: readonly T[],
	pickT: (item: T) => number,
	pickV: (item: T) => number | null | undefined,
	xFn: (t: number) => number,
	yFn: (v: number) => number
): string {
	let d = '';
	let open = false;
	for (const item of items) {
		const v = pickV(item);
		if (v == null || !Number.isFinite(v)) {
			open = false;
			continue;
		}
		d += `${open ? 'L' : 'M'}${xFn(pickT(item)).toFixed(1)},${yFn(v).toFixed(1)}`;
		open = true;
	}
	return d;
}

/** Builds a filled area SVG path under a polyline, closing each contiguous non-null segment cleanly to `baseY`. */
export function areaPath<T>(
	items: readonly T[],
	pickT: (item: T) => number,
	pickV: (item: T) => number | null | undefined,
	xFn: (t: number) => number,
	yFn: (v: number) => number,
	baseY: number
): string {
	let d = '';
	let seg: { x: number; y: number }[] = [];
	const flush = () => {
		if (seg.length < 2) {
			seg = [];
			return;
		}
		d += `M${seg[0].x.toFixed(1)},${baseY.toFixed(1)}`;
		for (const p of seg) d += `L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
		d += `L${seg[seg.length - 1].x.toFixed(1)},${baseY.toFixed(1)}Z`;
		seg = [];
	};
	for (const item of items) {
		const v = pickV(item);
		if (v == null || !Number.isFinite(v)) {
			flush();
			continue;
		}
		seg.push({ x: xFn(pickT(item)), y: yFn(v) });
	}
	flush();
	return d;
}

/** Finds the nearest recent station or buoy within `maxKm` from a `/data/wind.json` answer. */
export function nearestMeasuredFromWindMap(
	place: Place,
	windMap: WindMap | null | undefined,
	maxKm = 30
): MeasuredComparison | null {
	if (!windMap?.points.length) return null;
	let best: { p: WindMap['points'][number]; km: number } | null = null;
	for (const p of windMap.points) {
		const km = distanceKm(place, { lat: p.lat, lon: p.lon });
		if (km > maxKm) continue;
		if (!best || km < best.km) best = { p, km };
	}
	if (!best) return null;
	return {
		sourceName: best.p.name ?? (best.p.buoy ? 'Buoy' : 'Météo-France'),
		kind: best.p.buoy ? 'buoy' : 'station',
		distanceKm: Math.round(best.km * 10) / 10,
		altM: best.p.altM,
		measuredUtc: best.p.measured,
		windKmh: best.p.kmh,
		gustKmh: best.p.gustKmh,
		windFromDeg: best.p.fromDeg,
		airTempC: null,
		pressureHpa: null,
		attribution: windMap.attribution
	};
}

/** Which air pollutant curves actually have data in `airHourly`. */
export function airPollutantKeys(
	air: readonly AirHourlyPoint[]
): ('pm25' | 'pm10' | 'ozone' | 'nitrogenDioxide' | 'dust')[] {
	const keys = ['pm25', 'pm10', 'ozone', 'nitrogenDioxide', 'dust'] as const;
	return keys.filter((k) => finiteCount(air, (a) => a[k]) >= 2);
}
