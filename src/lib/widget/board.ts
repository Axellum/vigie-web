// The small widget of a place, « the frise » (piste F of the sketches of 2026-11-27, chosen by the author): the weather now and a
// discreet warning, then one band, the next hour as its twelve steps of rain followed by the next hours or days in « Lueur »
// columns, and the sentence of the rain under it. Pure: the rules are the Home Assistant card's own (`static/ha-card/vigie-card.js`:
// hourSlots, daysBlock, nowcastFirst, nowcastBars, rainTile, nextRain, glow), read from the site's copy of the answer
// (`PointWeather`), so that the card, the Android widgets and this page say one thing. The medium and large widgets are the card
// itself (CardWidget.svelte).
import type { Lang } from '../i18n';
import type { HourlyWeatherPoint, PointWeather } from '../types';
import type { IconKind } from './familyIcons';
import { dayLabel, type VigilanceView } from './model';
import type { WidgetTheme } from './params';

// --- the palette ---------------------------------------------------------------------------------------------------------------------

export interface IconColours {
	sun: string;
	moon: string;
	cloud: string;
	darkCloud: string;
	water: string;
	snow: string;
	flash: string;
	mist: string;
}

/** The colours of the card's themes (its `PALETTES`): the texts, the levels, the rain, the temperature ramp and the glow. */
export interface BoardPalette {
	text: string;
	t2: string;
	t3: string;
	t4: string;
	rule: string;
	accent: string;
	/** The text on a coloured pill. */
	on: string;
	green: string;
	yellow: string;
	orange: string;
	red: string;
	wind: string;
	rain: string;
	rainLight: string;
	rainHeavy: string;
	ramp: [string, string, string, string, string];
	glowNight: string;
	glowCloud: string;
	glowSun: string;
	glowStrength: number;
	/** A dry bar, the hollow of a dot. */
	hollow: string;
	/** The background under the drawings (the hollow dots of the days are punched in it). */
	card: string;
	icon: IconColours;
}

const DARK: BoardPalette = {
	text: '#F4F7FA',
	t2: '#CBD5DF',
	t3: '#A3B1C0',
	t4: '#7D8B9B',
	rule: '#2C3947',
	accent: '#3DDC97',
	on: '#10151C',
	green: '#6FE3B0',
	yellow: '#FFD25C',
	orange: '#FFA24D',
	red: '#FF6B5E',
	wind: '#7FD1FF',
	rain: '#58B4FF',
	rainLight: '#7FD1FF',
	rainHeavy: '#3A8CF0',
	ramp: ['#7FB2FF', '#5CD6FF', '#7BE495', '#FFC94A', '#FF6B4A'],
	glowNight: '#6F8FE0',
	glowCloud: '#A9B6C4',
	glowSun: '#FFC94A',
	glowStrength: 1,
	hollow: '#3A4654',
	card: '#19232E',
	icon: {
		sun: '#FFC83D',
		moon: '#EFE9CF',
		cloud: '#E3EAF2',
		darkCloud: '#8F9DB2',
		water: '#58B4FF',
		snow: '#FFFFFF',
		flash: '#FFD93D',
		mist: '#AAB6C4'
	}
};

const LIGHT: BoardPalette = {
	text: '#12171C',
	t2: '#37424E',
	t3: '#4F5C6A',
	t4: '#5F6B78',
	rule: '#D5DBE2',
	accent: '#0E8F5F',
	on: '#FFFFFF',
	green: '#1B8A5A',
	yellow: '#8A6400',
	orange: '#B45309',
	red: '#C22F2F',
	wind: '#0F78B0',
	rain: '#1E78D6',
	rainLight: '#4A9BE8',
	rainHeavy: '#155DB0',
	ramp: ['#2F6FDB', '#0A88B8', '#2E9E55', '#C77A00', '#D0391E'],
	glowNight: '#4A68C4',
	glowCloud: '#8C9AAA',
	glowSun: '#F0B400',
	glowStrength: 0.8,
	hollow: '#C9D1DA',
	card: '#FFFFFF',
	icon: {
		sun: '#F2A900',
		moon: '#B9A642',
		cloud: '#B8C3CF',
		darkCloud: '#7D8B9B',
		water: '#1E78D6',
		snow: '#7FA6CC',
		flash: '#E0A800',
		mist: '#8C99A8'
	}
};

/** The palette of a theme of the widget: the card's dark one under the sky, with the sky's own gold for « now ». */
export function boardPalette(theme: WidgetTheme): BoardPalette {
	if (theme === 'light') return LIGHT;
	if (theme === 'sky') return { ...DARK, accent: '#FFC857', card: '#1B2A44' };
	return DARK;
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const r1 = (v: number) => Math.round(v * 10) / 10;

/** Between two colours, `t` from 0 to 1. */
export function mix(a: string, b: string, t: number): string {
	const x = hex(a),
		y = hex(b);
	return `#${x
		.map((v, i) =>
			Math.round(v + (y[i] - v) * t)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
}

/** A colour with an opacity. */
export function alpha(colour: string, a: number): string {
	const [r, g, b] = hex(colour);
	return `rgba(${r},${g},${b},${Math.round(a * 1000) / 1000})`;
}

/** The temperatures of the ramp's five colours, as in the card. */
const RAMP_AT = [-10, 0, 12, 24, 36];

/** The colour of a temperature on the theme's ramp. */
export function tempColour(P: BoardPalette, t: number | null): string {
	if (!num(t)) return P.t2;
	if (t <= RAMP_AT[0]) return P.ramp[0];
	for (let i = 1; i < 5; i++)
		if (t <= RAMP_AT[i])
			return mix(P.ramp[i - 1], P.ramp[i], (t - RAMP_AT[i - 1]) / (RAMP_AT[i] - RAMP_AT[i - 1]));
	return P.ramp[4];
}

/** The blue of a rain rate (mm/h): light under 1, strong from 3. */
export const rainColour = (P: BoardPalette, mmH: number) =>
	mmH >= 3 ? P.rainHeavy : mmH >= 1 ? P.rain : P.rainLight;

/**
 * The glow of a column, top to bottom (« Lueur »): the tint of its sky, grey to gold with its share of sun, navy at night, fading
 * downwards. Three stops, as the card's linear gradient.
 */
export function glow(
	P: BoardPalette,
	sun: number | null,
	day: boolean
): { offset: number; colour: string }[] {
	const s = clamp(num(sun) ? sun : 0.3, 0, 1);
	const col = day ? mix(P.glowCloud, P.glowSun, s) : P.glowNight;
	const a = (day ? 0.11 + 0.21 * s : 0.16) * P.glowStrength;
	return [
		{ offset: 0, colour: alpha(col, Math.min(0.62, a * 2.3)) },
		{ offset: 0.38, colour: alpha(col, a * 0.9) },
		{ offset: 1, colour: alpha(col, 0.03) }
	];
}

// --- the sky ------------------------------------------------------------------------------------------------------------------------

/** The icon of a WMO weather code, as the Meridien screen and the card choose it. */
export function wmoKind(code: number | null | undefined): IconKind | null {
	if (!num(code)) return null;
	if (code === 0) return 'soleil';
	if (code <= 2) return 'eclaircies';
	if (code === 45 || code === 48) return 'brouillard';
	if (code >= 51 && code <= 55) return 'bruine';
	if (code === 56 || code === 57 || code === 66 || code === 67) return 'pluie_verglacante';
	if (code === 65) return 'pluie_forte';
	if (code >= 51 && code <= 67) return 'pluie';
	if (code === 75) return 'neige_forte';
	if (code === 77) return 'grains_de_neige';
	if (code >= 71 && code <= 77) return 'neige';
	if (code === 80 || code === 81) return 'averses';
	if (code === 82) return 'averses_violentes';
	if (code === 85 || code === 86) return 'averses_neige';
	if (code === 96 || code === 99) return 'orage_grele';
	if (code >= 95) return 'orage';
	return 'couvert';
}

const NIGHT_ICON: Partial<Record<IconKind, IconKind>> = {
	soleil: 'lune',
	eclaircies: 'nuit_nuageuse',
	averses: 'averses_nuit',
	averses_neige: 'averses_neige_nuit'
};

/** The night drawing of a kind, when it has one. */
export const atNight = (kind: IconKind | null, isDay: boolean): IconKind | null =>
	kind && !isDay ? (NIGHT_ICON[kind] ?? kind) : kind;

/** The share of sun of a weather code, when the hours give no cloud cover. */
export const sunOfCode = (code: number | null | undefined) =>
	!num(code)
		? 0.3
		: code === 0
			? 0.9
			: code === 1
				? 0.75
				: code === 2
					? 0.5
					: code === 3
						? 0.12
						: code <= 48
							? 0.1
							: 0.06;

/** The share of sun of some hours: 1 - their cloud cover, over the hours of daylight; null without them. */
export function sunOfHours(hours: HourlyWeatherPoint[]): number | null {
	const lit = hours.filter((h) => h.isDay !== false && num(h.cloudCoverPct));
	return lit.length ? lit.reduce((a, h) => a + 1 - (h.cloudCoverPct as number) / 100, 0) / lit.length : null;
}

/** Where the wind of some hours comes from: the mean of their vectors, weighted by the speed. */
export function windFrom(hours: HourlyWeatherPoint[]): number | null {
	let x = 0,
		y = 0;
	for (const h of hours)
		if (num(h.windDeg) && num(h.windKmh)) {
			x += Math.sin((h.windDeg * Math.PI) / 180) * h.windKmh;
			y += Math.cos((h.windDeg * Math.PI) / 180) * h.windKmh;
		}
	return x || y ? ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360 : null;
}

// --- the hours -----------------------------------------------------------------------------------------------------------------------

export interface Slot {
	/** The start of the slot (epoch seconds UTC). */
	ts: number;
	/** The temperature at its start. */
	temp: number;
	kind: IconKind | null;
	day: boolean;
	/** Its share of sun by day, null at night. */
	sun: number | null;
	/** The sum of its rain, mm. */
	mm: number | null;
	/** Its highest chance of rain, %. */
	chance: number | null;
	/** Its mean wind and highest gust, km/h. */
	wind: number | null;
	gust: number | null;
	/** Where its wind comes from, degrees. */
	deg: number | null;
}

const sum = (l: number[]) => l.reduce((a, b) => a + b, 0);
const values = (list: HourlyWeatherPoint[], key: keyof HourlyWeatherPoint) =>
	list.map((h) => h[key]).filter(num);

/** The hours of the answer from the current one on, with a temperature. */
function hoursFrom(w: PointWeather | null, now: number): HourlyWeatherPoint[] {
	const from = now - (now % 3600);
	return (w?.hourly ?? []).filter((h) => num(h.t) && h.t >= from && num(h.tempC));
}

/**
 * The next hours by `step` hours, at most `count` slots, as the card makes them: the temperature at the start of the slot, its
 * most significant weather (the highest WMO code), the sum of its rain, its highest chance, its mean wind and highest gust. Fewer
 * than four slots: none (the block is left out).
 */
export function hourSlots(w: PointWeather | null, now: number, step: number, count: number): Slot[] {
	const hours = hoursFrom(w, now);
	const n = Math.min(Math.floor(hours.length / step), count);
	if (n < 4) return [];
	const slots: Slot[] = [];
	for (let i = 0; i < n; i++) {
		const g = hours.slice(i * step, (i + 1) * step);
		const codes = values(g, 'weatherCode');
		const code = codes.length ? Math.max(...codes) : null;
		const day = g[0].isDay !== false;
		const mm = values(g, 'precipMm'),
			p = values(g, 'precipProbPct'),
			wind = values(g, 'windKmh'),
			gust = values(g, 'windGustKmh');
		slots.push({
			ts: g[0].t,
			temp: g[0].tempC as number,
			kind: atNight(wmoKind(code), day),
			day,
			sun: day ? (sunOfHours(g) ?? sunOfCode(code)) : null,
			mm: mm.length ? sum(mm) : null,
			chance: p.length ? Math.max(...p) : null,
			wind: wind.length ? sum(wind) / wind.length : null,
			gust: gust.length ? Math.max(...gust) : null,
			deg: windFrom(g)
		});
	}
	return slots;
}

// --- the days ------------------------------------------------------------------------------------------------------------------------

export interface DayColumn {
	date: string;
	/** `Auj.` for today, else the day and its number (`Ven 28`). */
	name: string;
	/** The day alone (`Ven`), for a narrow column. */
	short: string;
	kind: IconKind | null;
	tmax: number;
	tmin: number;
	/** The rain of the day, mm. */
	mm: number | null;
	sun: number;
}

/** The place's own date of an instant. */
const localDay = (t: number, offsetS: number) => new Date((t + offsetS) * 1000).toISOString().slice(0, 10);

/** The days from today on (by the place's date), at most `count`, each with its highest and lowest; fewer than two: none. */
export function dayColumns(w: PointWeather | null, now: number, lang: Lang, count = 5): DayColumn[] {
	if (!w) return [];
	const offset = w.utcOffsetS ?? 0;
	const today = localDay(now, offset);
	const hourly = w.hourly ?? [];
	const list = w.daily.filter((d) => d.date >= today && num(d.tmaxC) && num(d.tminC)).slice(0, count);
	if (list.length < 2) return [];
	return list.map((d, i) => {
		const lit = hourly.filter((h) => num(h.t) && localDay(h.t, offset) === d.date && h.isDay === true);
		const short = dayLabel(lang, d.date);
		return {
			date: d.date,
			name: i === 0 ? (lang === 'fr' ? 'Auj.' : 'Today') : `${short} ${Number(d.date.slice(8))}`,
			short: i === 0 ? (lang === 'fr' ? 'Auj.' : 'Today') : short,
			kind: wmoKind(d.code),
			tmax: d.tmaxC as number,
			tmin: d.tminC as number,
			mm: d.rainMm,
			sun: sunOfHours(lit) ?? sunOfCode(d.code)
		};
	});
}

// --- the rain of the hour ------------------------------------------------------------------------------------------------------------

export interface RainBar {
	/** The rate of the step, mm/h. */
	r: number;
	/** The start of the step (epoch seconds UTC). */
	at: number;
	minutes: number;
	/** False when the answer does not say when its steps start (an older API): the bars count from now. */
	known: boolean;
}

/**
 * The steps of the nowcast still to come, the one in progress included, as the card reads them: twelve 5-minute rates (PIAF, in
 * France) or the 15-minute amounts of Open-Meteo, as rates.
 */
export function rainBars(w: PointWeather | null, now: number): RainBar[] {
	const rain = w?.rain;
	const rates = rain?.rate5mMmH?.length ? rain.rate5mMmH : null;
	const steps = rain?.mmPerStep?.length ? rain.mmPerStep : null;
	if (!rain || (!rates && !steps)) return [];
	const minutes = rates ? 5 : (rain.stepMinutes ?? 15);
	const start = num(rain.startUtc) ? rain.startUtc : null;
	const series = rates ?? (steps as number[]).map((v) => (v * 60) / minutes);
	return series
		.map((r, i) => ({ r, minutes, known: start !== null, at: (start ?? now) + i * minutes * 60 }))
		.filter((b) => !b.known || b.at + b.minutes * 60 > now);
}

/** The minutes to the first rain of the hour, 0 when it rains now, -1 for none; null without a nowcast (the card's rule). */
export function rainFirst(bars: RainBar[], now: number): number | null {
	if (!bars.length) return null;
	const wet = bars.find((b) => b.r > 0);
	if (!wet) return -1;
	return wet.known ? Math.max(0, Math.ceil((wet.at - now) / 60)) : bars.indexOf(wet) * wet.minutes;
}

/** The height of a bar in a drawing `height` tall: the square root keeps a light rain visible next to a downpour. */
export const barHeight = (r: number, height: number, dry = 2) =>
	r > 0 ? r1(Math.max(4, 4 + Math.sqrt(Math.min(r, 4) / 4) * (height - 4))) : dry;

// --- the warnings --------------------------------------------------------------------------------------------------------------------

const LEVEL_WORD = {
	fr: { RED: 'rouge', ORANGE: 'orange', YELLOW: 'jaune', GREEN: 'verte' },
	en: { RED: 'Red', ORANGE: 'Orange', YELLOW: 'Yellow', GREEN: 'Green' }
} as const;

/**
 * The words of the warning's pill, as on Android: the phenomenon and its level (`Vent jaune`, `Yellow wind`), `+n` for the
 * others; null without a level. `short`, for the compact size: the phenomenon alone, the colour of the pill tells its level.
 */
export function pillWords(lang: Lang, v: VigilanceView, short = false): string | null {
	const level = v.level;
	if (!level || !(level in LEVEL_WORD.fr)) return null;
	const word = LEVEL_WORD[lang][level as keyof typeof LEVEL_WORD.fr];
	const first = v.labels[0];
	const base = first
		? short
			? first
			: lang === 'fr'
				? `${first} ${word}`
				: `${word} ${first.charAt(0).toLowerCase()}${first.slice(1)}`
		: lang === 'fr'
			? `Vigilance ${word}`
			: `${word} warning`;
	const more = Math.max(0, v.labels.length - 1) + v.more;
	return more > 0 ? `${base} +${more}` : base;
}

/** The colour of a level, from the palette. */
export const levelColour = (P: BoardPalette, level: string | null) =>
	level === 'RED' ? P.red : level === 'ORANGE' ? P.orange : level === 'YELLOW' ? P.yellow : P.t3;

// --- the frise of the small widget -------------------------------------------------------------------------------------------------

/** The words of a rate of rain, the card's thresholds (mm/h). */
export type RainStrength = 'light' | 'moderate' | 'heavy';
export const rainStrength = (r: number): RainStrength => (r >= 3 ? 'heavy' : r >= 1 ? 'moderate' : 'light');

/**
 * What the sentence of the rain adds after its head, as the card's rain tile: how strong the rain of the hour is (its first wet step
 * and its strongest), or after a dry hour when the next rain comes, or until when it stays dry.
 */
export type RainNote =
	| { kind: 'strength'; first: RainStrength; peak: RainStrength }
	| { kind: 'next'; at: number }
	| { kind: 'dry'; until: number };

/**
 * The note of the rain. After a dry hour the card reads the nowcast, then AROME-PI, then the hours; the site's copy of the answer
 * keeps no AROME-PI steps, so here the nowcast then the hours (a rain of a few minutes between them may come out an hour later).
 */
export function rainNote(w: PointWeather | null, bars: RainBar[], now: number): RainNote | null {
	const wet = bars.filter((b) => b.r > 0);
	if (wet.length)
		return {
			kind: 'strength',
			first: rainStrength(wet[0].r),
			peak: rainStrength(Math.max(...wet.map((b) => b.r)))
		};
	const slots: { from: number; to: number; wet: boolean }[] = [];
	let end = now;
	const push = (from: number, to: number, isWet: boolean) => {
		if (to <= end) return;
		slots.push({ from: Math.max(from, end), to, wet: isWet });
		end = to;
	};
	for (const b of bars) push(b.at, b.at + b.minutes * 60, b.r > 0);
	for (const h of w?.hourly ?? []) if (num(h.t) && num(h.precipMm)) push(h.t, h.t + 3600, h.precipMm >= 0.1);
	const after = now + 3600;
	const next = slots.find((x) => x.wet && x.to > after);
	if (next) return { kind: 'next', at: Math.max(next.from, after) };
	const last = slots.at(-1);
	return last && last.to > after ? { kind: 'dry', until: last.to } : null;
}

const SNOWY = (code: number | null | undefined) =>
	num(code) && ((code >= 71 && code <= 77) || code === 85 || code === 86);

/** Whether the precipitation at an instant is snow: the weather of its hour, else the weather now (the card's rule, without AROME-PI). */
export function snowAt(w: PointWeather | null, ts: number): boolean {
	const hour = (w?.hourly ?? []).find((h) => num(h.t) && h.t <= ts && ts < h.t + 3600);
	return SNOWY(hour ? hour.weatherCode : w?.current?.code);
}

/** A column of the frise: an hour (its temperature and rain) or a day (its highest and lowest). */
export interface FriseColumn {
	ts: number | null;
	date: string | null;
	kind: IconKind | null;
	sun: number | null;
	day: boolean;
	high: number;
	/** The lowest of a day; null for an hour. */
	low: number | null;
	/** The rain of the hour, mm; null for a day (the frise has no room for it). */
	mm: number | null;
	/** The day's name (`Sam`); null for an hour, whose label is its time. */
	name: string | null;
}

/**
 * The columns of the frise after its box of the hour: the next `count` hours from the next one, or the next `count` days from
 * tomorrow. Without a box (no nowcast), from the current hour or from today. Too few: none.
 */
export function friseColumns(
	w: PointWeather | null,
	now: number,
	lang: Lang,
	forecast: 'hours' | 'days',
	count: number,
	afterBox: boolean
): FriseColumn[] {
	const skip = afterBox ? 1 : 0;
	if (forecast === 'days') {
		const days = dayColumns(w, now, lang, count + skip).slice(skip);
		return days.length < 2
			? []
			: days.map((d) => ({
					ts: null,
					date: d.date,
					kind: d.kind,
					sun: d.sun,
					day: true,
					high: d.tmax,
					low: d.tmin,
					mm: null,
					name: d.short
				}));
	}
	return hourSlots(w, now, 1, count + skip)
		.slice(skip)
		.map((x) => ({
			ts: x.ts,
			date: null,
			kind: x.kind,
			sun: x.sun,
			day: x.day,
			high: x.temp,
			low: null,
			mm: x.mm,
			name: null
		}));
}
