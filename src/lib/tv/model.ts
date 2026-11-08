// What the television screen shows, worked out from the answers of the API for one surf spot: the wind and the swell of the hour,
// the tide, the verdicts of the four activities, the sky and the sun. Pure: the same answers and the same `now` give the same
// screen, so that a test can fix both. Every figure is the API's (or a unit change of it); one it did not give is `null` and the
// screen shows "–" or says so, never a guess.
import {
	ACTIVITY_IDS,
	reasonText,
	type ActivitiesForecast,
	type Activity,
	type ActivityCriterion,
	type ActivityId,
	type Verdict
} from '../activities';
import { number } from '../format';
import type { Lang } from '../i18n';
import { compass, hourLabel, SURF_TIME_ZONE, type SurfForecast, type SurfHour, type SurfSpot } from '../surf';
import { showsFrenchCoefficient, type TideCurve } from '../tides';
import type { PointWeather } from '../types';
import { skyLabel } from '../weather';
import type { TvParams } from './params';
import { tvText, type TvKey } from './text';

/** An answer of the API as the site's cache holds it: its value, whether it is the last good one, when it was read (ms). */
export interface Fresh<T> {
	value: T;
	stale: boolean;
	fetchedAt: number;
}

export interface TvInput {
	/** UTC epoch seconds. */
	now: number;
	lang: Lang;
	params: TvParams;
	spot: SurfSpot;
	activities: Fresh<ActivitiesForecast> | null;
	forecast: Fresh<SurfForecast> | null;
	tide: Fresh<TideCurve> | null;
	sky: Fresh<PointWeather> | null;
}

// --- units and words -------------------------------------------------------------------------------------------------------------

export const knots = (kmh: number | null): number | null => (kmh == null ? null : kmh / 1.852);

const BEAUFORT_FROM_KN = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];

/** The Beaufort force of a wind in knots (the API's rules round the knots first). */
export const beaufort = (kn: number): number => BEAUFORT_FROM_KN.filter((b) => Math.round(kn) >= b).length;

export const BEAUFORT_WORD = {
	fr: [
		'calme',
		'très légère brise',
		'légère brise',
		'petite brise',
		'jolie brise',
		'bonne brise',
		'vent frais',
		'grand frais',
		'coup de vent',
		'fort coup de vent',
		'tempête',
		'violente tempête',
		'ouragan'
	],
	en: [
		'calm',
		'light air',
		'light breeze',
		'gentle breeze',
		'moderate breeze',
		'fresh breeze',
		'strong breeze',
		'near gale',
		'gale',
		'strong gale',
		'storm',
		'violent storm',
		'hurricane'
	]
} as const;

/** The hour of day (0 to 23) in the spots' time zone. */
export function hourOf(t: number): number {
	return parseInt(
		new Intl.DateTimeFormat('en-GB', { timeZone: SURF_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(
			t * 1000
		),
		10
	);
}

/** The offset of the spots' time zone from UTC at `t`, in seconds: the clock of the screen runs on it, whatever its own says. */
export function zoneOffsetS(t: number): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', {
			timeZone: SURF_TIME_ZONE,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric'
		})
			.formatToParts(t * 1000)
			.map((p) => [p.type, Number(p.value)])
	) as Record<string, number>;
	const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
	return Math.round(asUtc / 1000 - Math.floor(t));
}

/** The day of an epoch second in the spots' time zone (`2026-11-08`). */
const dayOf = (t: number): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone: SURF_TIME_ZONE }).format(t * 1000);

/** The date as words, in the spots' time zone: `dimanche 8 novembre`. */
export function dateLabel(lang: Lang, t: number): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		timeZone: SURF_TIME_ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(t * 1000);
}

/** The index of the hour that holds `now` (hours are whole hours, as the API says); -1 when the answer does not reach it. */
export function hourIndex(hours: { t: number }[], now: number): number {
	return hours.findIndex((h) => h.t <= now && now < h.t + 3600);
}

// --- the instruments -----------------------------------------------------------------------------------------------------------

export interface TvBar {
	/** The hour under the bar (`11 h`), every few bars. */
	label: string | null;
	/** Height of the bar and of the gust mark, in percent of the tallest. */
	pct: number;
	gustPct: number | null;
	night: boolean;
}

export interface TvWind {
	kn: number | null;
	gustKn: number | null;
	deg: number | null;
	force: number | null;
	word: string | null;
	from: string | null;
	relative: string | null;
	bars: TvBar[];
}

export interface TvSwell {
	m: number | null;
	periodS: number | null;
	from: string | null;
	bars: TvBar[];
}

export interface TvCurve {
	path: string;
	area: string;
	/** Positions in percent of the drawing, for the marks laid over it. */
	now: { x: number; y: number } | null;
	extremes: { kind: 'high' | 'low'; x: number; y: number }[];
}

export interface TvTide {
	trend: 'rising' | 'falling' | null;
	next: { kind: 'high' | 'low'; time: string }[];
	coefficient: number | null;
	range: number | null;
	curve: TvCurve | null;
}

export interface TvCell {
	verdict: Verdict | null;
	night: boolean;
	/** The first cell of the strip is the hour now. */
	now: boolean;
}

export interface TvChip {
	verdict: Verdict;
	name: string;
	value: string;
}

export interface TvActivity {
	id: ActivityId;
	available: boolean;
	verdict: Verdict | null;
	slot: string | null;
	reason: string | null;
	chips: TvChip[];
	cells: TvCell[];
	/** The hours under the strip: its start, its middle and its end. */
	marks: string[];
}

export interface TvSky {
	tempC: number | null;
	feelsC: number | null;
	label: string;
	uv: number | null;
	/** The temperature of the sea, °C: a value of an ocean model for a cell of about 8 km, not a measurement at the beach. */
	waterC: number | null;
	rise: string | null;
	set: string | null;
}

/**
 * The rain of the next hour, from the 15-minute steps the API gives (a forecast of the weather model, not a radar). `unknown` is
 * the API giving none, or the reading being too old to say anything of the hour to come; the screen then shows "not read".
 */
export interface TvRain {
	status: 'none' | 'some' | 'unknown';
	level: 'light' | 'moderate' | 'heavy' | null;
	/** The strongest step as an hourly rate, in mm/h. */
	maxMmH: number | null;
	bars: { pct: number; wet: boolean }[];
}

export interface TvScreen {
	spot: { id: string; name: string; place: string | null };
	now: number;
	/** The clock of the screen: seconds to add to UTC. */
	offsetS: number;
	theme: 'day' | 'night';
	/** The coming daylight windows `[sunrise, sunset]` (epoch seconds), so that the screen can turn itself to night. */
	windows: [number, number][];
	/** The oldest reading (epoch seconds) of the data the screen stands on; null when it has none. */
	fresh: number | null;
	stale: boolean;
	/** Something the screen would show was not available (a part answered nothing). */
	partial: boolean;
	vigilance: 'none' | 'in' | 'unknown';
	wind: TvWind | null;
	swell: TvSwell | null;
	tide: TvTide | null;
	activities: TvActivity[];
	sky: TvSky | null;
	rain: TvRain;
	credit: string;
}

const KIND: Record<'high' | 'low', 'high' | 'low'> = { high: 'high', low: 'low' };

/** Data older than this is called old on the screen (the API's answers are kept ten minutes, the site's cache as long). */
export const STALE_AFTER_S = 30 * 60;

function barsOf(
	hours: SurfHour[],
	from: number,
	count: number,
	value: (h: SurfHour) => number | null,
	gust: ((h: SurfHour) => number | null) | null,
	least: number,
	every: number,
	lang: Lang
): TvBar[] {
	const slice = hours.slice(from, from + count);
	const top = Math.max(least, ...slice.map((h) => Math.max(value(h) ?? 0, gust?.(h) ?? 0)));
	return slice.map((h, i) => {
		const g = gust?.(h) ?? null;
		return {
			label: i % every === 0 ? tvText(lang, 'hourShort', { h: hourOf(h.t) }) : null,
			pct: ((value(h) ?? 0) / top) * 100,
			gustPct: g != null && g > 0 ? (g / top) * 100 : null,
			night: h.daylight === false
		};
	});
}

function windView(forecast: SurfForecast | null, now: number, lang: Lang): TvWind | null {
	if (!forecast) return null;
	const i = hourIndex(forecast.hours, now);
	if (i < 0) return null;
	const h = forecast.hours[i];
	const kn = knots(h.wind.speed);
	const force = kn == null ? null : beaufort(kn);
	return {
		kn,
		gustKn: knots(h.wind.gust),
		deg: h.wind.from,
		force,
		word: force == null ? null : BEAUFORT_WORD[lang][force],
		from: h.wind.from == null ? null : tvText(lang, 'from', { point: compass(lang, h.wind.from) }),
		relative: h.wind.relative ? tvText(lang, h.wind.relative) : null,
		bars: barsOf(
			forecast.hours,
			i,
			12,
			(x) => knots(x.wind.speed),
			(x) => knots(x.wind.gust),
			1,
			3,
			lang
		)
	};
}

function swellView(forecast: SurfForecast | null, now: number, lang: Lang): TvSwell | null {
	if (!forecast) return null;
	const i = hourIndex(forecast.hours, now);
	if (i < 0) return null;
	const h = forecast.hours[i];
	return {
		m: h.swell.height,
		periodS: h.swell.period,
		from: h.swell.from == null ? null : compass(lang, h.swell.from),
		bars: barsOf(forecast.hours, i, 12, (x) => x.swell.height, null, 1, 3, lang)
	};
}

/** The height of the curve at `t`, between its two nearest points; null outside it. */
export function heightAt(heights: [number, number][], t: number): number | null {
	for (let i = 1; i < heights.length; i++) {
		const [t1, h1] = heights[i];
		const [t0, h0] = heights[i - 1];
		if (t >= t0 && t <= t1) return t1 === t0 ? h1 : h0 + ((h1 - h0) * (t - t0)) / (t1 - t0);
	}
	return null;
}

const CURVE = { w: 1000, h: 300, side: 18, pad: 16 };

export function tideView(
	curve: TideCurve | null,
	now: number,
	lang: Lang,
	spot: Pick<SurfSpot, 'lat' | 'lon'>,
	hoursAhead = 24,
	/** The time of day of a moment: the spots' time zone unless the screen is for another place. */
	label: (lang: Lang, t: number) => string = hourLabel
): TvTide | null {
	if (!curve) return null;
	const t0 = curve.start;
	const t1 = t0 + hoursAhead * 3600;
	const inWindow = curve.heights.filter(([t]) => t >= t0 && t <= t1);
	const all = curve.heights.map(([, h]) => h);
	const lo = Math.min(...all);
	const span = Math.max(Math.max(...all) - lo, 0.01);
	const x = (t: number) => CURVE.side + ((t - t0) / (t1 - t0)) * (CURVE.w - 2 * CURVE.side);
	const y = (h: number) => CURVE.pad + (1 - (h - lo) / span) * (CURVE.h - 2 * CURVE.pad);
	const pctX = (t: number) => (x(t) / CURVE.w) * 100;
	const pctY = (h: number) => (y(h) / CURVE.h) * 100;

	let drawn: TvCurve | null = null;
	if (inWindow.length >= 2) {
		const line = inWindow.map(([t, h]) => `${x(t).toFixed(1)},${y(h).toFixed(1)}`);
		const path = `M${line.join('L')}`;
		const last = inWindow[inWindow.length - 1];
		const hereHeight = now >= t0 && now <= t1 ? heightAt(curve.heights, now) : null;
		drawn = {
			path,
			area: `${path}L${x(last[0]).toFixed(1)},${CURVE.h}L${x(inWindow[0][0]).toFixed(1)},${CURVE.h}Z`,
			now: hereHeight == null ? null : { x: pctX(now), y: pctY(hereHeight) },
			extremes: curve.extremes
				.filter((e) => e.t > t0 && e.t < t1)
				.map((e) => ({ kind: KIND[e.kind], x: pctX(e.t), y: pctY(e.h) }))
		};
	}

	// The slope at now says whether it rises or falls; the API's own `now` answers the same, but it is as old as the reading.
	const here = heightAt(curve.heights, now);
	const next = heightAt(curve.heights, now + 900);
	const last = heightAt(curve.heights, now - 900);
	const slope = here == null ? null : next != null ? next - here : last != null ? here - last : null;
	const trend = slope == null || slope === 0 ? null : slope > 0 ? 'rising' : 'falling';
	const upcoming = curve.extremes.filter((e) => e.t > now);
	const coefficient = showsFrenchCoefficient(spot.lat, spot.lon)
		? (curve.coefficients.reduce<{ t: number; value: number } | null>(
				(best, c) => (best == null || Math.abs(c.t - now) < Math.abs(best.t - now) ? c : best),
				null
			)?.value ?? null)
		: null;
	return {
		trend,
		next: upcoming.slice(0, 2).map((e) => ({ kind: e.kind, time: label(lang, e.t) })),
		coefficient,
		range: upcoming[0]?.range ?? null,
		curve: drawn
	};
}

// --- the verdicts --------------------------------------------------------------------------------------------------------------

/** The value of a criterion in the few characters of a chip: `10 nd`, `3 Bf`, `0,4 m`. */
export function chipValue(lang: Lang, c: ActivityCriterion): string | null {
	if (c.value == null) return null;
	switch (c.unit) {
		case 'm':
			return `${number(lang, c.value, 1)} m`;
		case 's':
			return `${number(lang, c.value, 0)} s`;
		case 'km/h':
			return `${number(lang, c.value / 1.852, 0)} ${tvText(lang, 'knotsShort')}`;
		case 'kn':
			return `${number(lang, c.value, 0)} ${tvText(lang, 'knotsShort')}`;
		case 'Beaufort':
			return `${number(lang, c.value, 0)} Bf`;
		case 'deg':
			return `${number(lang, c.value, 0)}°`;
		case 'min':
			return `${number(lang, c.value, 0)} min`;
		default:
			return number(lang, c.value, 0);
	}
}

const CHIP_KEYS = new Set([
	'wind',
	'gust_gap',
	'wind_direction',
	'wind_force',
	'gust_force',
	'sea_height',
	'low_water',
	'coefficient',
	'swell_height',
	'swell_period',
	'swell_direction',
	'tide'
]);

function slotText(lang: Lang, slot: Activity['slot'], now: number): string | null {
	// A slot that has ended says nothing about the hours to come: the answer is old, and the screen says so.
	if (!slot || slot.end <= now) return null;
	const day = dayOf(slot.start) === dayOf(now) ? '' : `${tvText(lang, 'tomorrow')} `;
	return `${day}${hourLabel(lang, slot.start)} – ${hourLabel(lang, slot.end)}`;
}

function activityView(a: Activity, now: number, lang: Lang): TvActivity {
	const start = Math.floor(now / 3600) * 3600;
	const hours = a.hours.filter((h) => h.t >= start).slice(0, 24);
	const cells: TvCell[] = hours.map((h, i) => ({
		verdict: h.verdict,
		night: h.daylight === false,
		now: i === 0
	}));
	return {
		id: a.id,
		available: a.available,
		verdict: a.available ? a.verdict : null,
		slot: a.available ? slotText(lang, a.slot, now) : null,
		reason: a.available ? reasonText(lang, a.reason) : null,
		chips: (a.detail?.criteria ?? [])
			.filter((c) => c.verdict && CHIP_KEYS.has(c.name))
			.slice(0, 4)
			.flatMap((c): TvChip[] => {
				const value = chipValue(lang, c);
				return value && c.verdict
					? [{ verdict: c.verdict, name: tvText(lang, `criterion.${c.name}` as TvKey), value }]
					: [];
			}),
		cells,
		marks: hours.length
			? [hours[0], hours[Math.min(12, hours.length - 1)], hours[hours.length - 1]].map((h) =>
					tvText(lang, 'hourShort', { h: hourOf(h.t) })
				)
			: []
	};
}

// --- the sky and the sun -------------------------------------------------------------------------------------------------------

/** The daylight windows of the API's `sun` that are not over yet. */
export function daylightWindows(sun: ActivitiesForecast['sun'], now: number): [number, number][] {
	return sun.filter((s) => s.set > now - 86_400).map((s): [number, number] => [s.rise, s.set]);
}

/** Day or night: by the sun when the API gave it, else by the daylight flag of the hour, else day. */
export function isDay(
	windows: [number, number][],
	hours: { t: number; daylight: boolean | null }[],
	now: number
): boolean {
	if (windows.length && now >= windows[0][0] - 86_400 && now < windows[windows.length - 1][1]) {
		return windows.some(([rise, set]) => now >= rise && now < set);
	}
	const i = hourIndex(hours, now);
	return i < 0 || hours[i].daylight !== false;
}

function skyView(
	point: PointWeather | null,
	sun: ActivitiesForecast['sun'],
	now: number,
	lang: Lang
): TvSky | null {
	const today = sun.find((s) => dayOf(s.rise) === dayOf(now)) ?? null;
	const current = point?.current ?? null;
	if (!current && !today) return null;
	return {
		tempC: current?.tempC ?? null,
		feelsC: current?.feelsLikeC ?? null,
		label: current ? skyLabel(lang, current.code) : '–',
		uv: current?.uv ?? null,
		waterC: point?.marine?.seaTempC ?? null,
		rise: today ? hourLabel(lang, today.rise) : null,
		set: today ? hourLabel(lang, today.set) : null
	};
}

// --- the rain of the hour --------------------------------------------------------------------------------------------------------

/** A step wetter than this is rain (the API's own threshold for `rain_expected_60m`, in mm per step). */
const WET_STEP_MM = 0.05;
/** The words are ours, not an official scale: light under 2.5 mm/h, moderate under 7.6, heavy from there (docs/tv.md). */
const LIGHT_BELOW_MM_H = 2.5;
const MODERATE_BELOW_MM_H = 7.6;
/** A bar is full at this rate. */
const FULL_BAR_MM_H = 10;
/** A rain forecast of the hour to come is worth nothing once the reading is older than this. */
export const RAIN_MAX_AGE_S = 30 * 60;

export function rainView(sky: Fresh<PointWeather> | null, now: number): TvRain {
	const unknown: TvRain = { status: 'unknown', level: null, maxMmH: null, bars: [] };
	const rain = sky?.value.rain ?? null;
	if (!sky || !rain || !rain.mmPerStep || rain.mmPerStep.length === 0) return unknown;
	// The API names the provider "… (stale cache)" when it serves an expired entry (it has no flag for it).
	if (sky.stale || /\(stale/i.test(sky.value.provider ?? '') || now - sky.fetchedAt / 1000 > RAIN_MAX_AGE_S)
		return unknown;
	const perHour = 60 / (rain.stepMinutes ?? 15);
	const rates = rain.mmPerStep.map((mm) => mm * perHour);
	const maxMmH = Math.max(...rates);
	const wet = rain.mmPerStep.some((mm) => mm > WET_STEP_MM);
	return {
		status: wet ? 'some' : 'none',
		level: !wet
			? null
			: maxMmH < LIGHT_BELOW_MM_H
				? 'light'
				: maxMmH < MODERATE_BELOW_MM_H
					? 'moderate'
					: 'heavy',
		maxMmH: wet ? maxMmH : 0,
		bars: rain.mmPerStep.map((mm, i) => {
			const isWet = mm > WET_STEP_MM;
			// A drop of rain must show: at least a stub, never more than a full bar.
			return {
				pct: isWet ? Math.min(100, Math.max(14, Math.round((rates[i] / FULL_BAR_MM_H) * 100))) : 6,
				wet: isWet
			};
		})
	};
}

// --- the credits ---------------------------------------------------------------------------------------------------------------

/**
 * The credits the API gave, joined: each answer carries the `attribution` of its sources, the same pieces appear in several of
 * them. A television cannot follow a link, so the web addresses are left out of the text; the words stay as the API wrote them.
 */
export function creditOf(attributions: (string | null | undefined)[]): string {
	const seen = new Set<string>();
	const pieces: string[] = [];
	for (const text of attributions) {
		for (const raw of (text ?? '').split(' | ')) {
			const piece = raw
				.replace(/\s*\(https?:\/\/[^)]*\)/g, '')
				.replace(/[;,]?\s*https?:\/\/\S+/g, '')
				.replace(/\s+/g, ' ')
				.trim()
				.replace(/[;,.\s]+$/, '');
			if (piece && !seen.has(piece)) {
				seen.add(piece);
				pieces.push(piece);
			}
		}
	}
	return pieces.join(' · ');
}

// --- the whole screen ----------------------------------------------------------------------------------------------------------

export function buildScreen(input: TvInput): TvScreen {
	const { now, lang, params, spot } = input;
	const act = input.activities?.value ?? null;
	const forecast = input.forecast?.value ?? null;
	const sun = act?.sun ?? [];
	const windows = daylightWindows(sun, now);
	const hours =
		forecast?.hours ?? act?.activities[0]?.hours.map((h) => ({ t: h.t, daylight: h.daylight })) ?? [];
	const day = params.theme === 'auto' ? isDay(windows, hours, now) : params.theme === 'day';

	const readings = [input.activities, input.forecast, input.tide].filter((r): r is Fresh<never> => r != null);
	const fresh = readings.length ? Math.floor(Math.min(...readings.map((r) => r.fetchedAt)) / 1000) : null;
	const wind = windView(forecast, now, lang);
	const swell = swellView(forecast, now, lang);
	const tide = tideView(input.tide?.value ?? null, now, lang, spot);
	const activities = act
		? ACTIVITY_IDS.flatMap((id) => {
				const a = act.activities.find((x) => x.id === id);
				return a ? [activityView(a, now, lang)] : [];
			})
		: [];
	return {
		spot: { id: spot.id, name: spot.name, place: spot.place },
		now,
		offsetS: zoneOffsetS(now),
		theme: day ? 'day' : 'night',
		windows,
		fresh,
		stale:
			readings.some((r) => r.stale) ||
			(fresh != null && now - fresh > STALE_AFTER_S) ||
			Boolean(act?.stale || input.tide?.stale),
		partial: !act || !forecast || !input.tide || !input.sky,
		vigilance:
			!act || act.vigilance.status !== 'ok' ? 'unknown' : act.vigilance.alerts.length ? 'in' : 'none',
		wind,
		swell,
		tide,
		activities,
		sky: skyView(input.sky?.value ?? null, sun, now, lang),
		rain: rainView(input.sky, now),
		credit: creditOf([
			act?.attribution,
			forecast?.attribution,
			input.tide?.value.attribution,
			input.sky?.value.attribution,
			input.sky?.value.rain?.attribution,
			// The credit of the sea comes with the temperature it is for: the waves of the same answer are not on the screen.
			input.sky?.value.marine?.seaTempC != null ? input.sky.value.marine.attribution : null
		])
	};
}
