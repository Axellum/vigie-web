// What the widget page shows for a place, worked out from what the site already serves: the official warnings that hold the
// place, the rain of the hour to come, the wind measured by the nearest station, the gusts AROME-PI forecasts (France only) and
// the days. Pure: the same answers and the same `now` give the same widget, so that a test can fix both. A figure the API did
// not give stays null and its block is left out: outside France the page shows less, never a guess.
import type { Lang } from '../i18n';
import { rank } from '../levels';
import { distanceKm, type Place, type WarningHere } from '../near';
import type { OfficialState } from '../sentence';
import type { TvActivity } from '../tv/model';
import type { Level, PointWeather } from '../types';
import type { WindPoint } from '../wind';
import type { WidgetTheme } from './params';

// --- the rain of the hour ----------------------------------------------------------------------------------------------------------

/** A step wetter than this is rain (the API's own threshold for `rain_expected_60m`, in mm per step), as on the TV screen. */
export const WET_STEP_MM = 0.05;
/** A forecast of the hour to come is worth nothing once the reading is older than this. */
export const RAIN_MAX_AGE_S = 30 * 60;

export type RainTone = 'dry' | 'light' | 'rain' | 'heavy';

export interface RainBar {
	/** Height in percent of the drawing: a drop of rain always shows, a dry step is a thin line. */
	pct: number;
	tone: RainTone;
}

export interface RainView {
	status: 'none' | 'now' | 'soon' | 'unknown';
	/** Minutes until the first wet step (0 when it rains now); null without rain. */
	inMin: number | null;
	/** Minutes of rain from the first wet step on, within the hour. */
	forMin: number | null;
	/** The strongest step as an hourly rate, mm/h. */
	maxMmH: number | null;
	stepMinutes: number;
	bars: RainBar[];
}

/** The colour of a rate: the charter's three blues, light under 1 mm/h, strong from 3 mm/h. */
export const rainTone = (mmH: number): RainTone => (mmH < 1 ? 'light' : mmH < 3 ? 'rain' : 'heavy');

export function rainView(w: (PointWeather & { stale?: boolean }) | null, now: number): RainView {
	const unknown: RainView = {
		status: 'unknown',
		inMin: null,
		forMin: null,
		maxMmH: null,
		stepMinutes: 15,
		bars: []
	};
	const rain = w?.rain ?? null;
	if (!w || !rain?.mmPerStep?.length) return unknown;
	// The API names the provider "… (stale cache)" when it serves an expired entry; the site's cache says `stale`.
	if (w.stale || /\(stale/i.test(w.provider ?? '')) return unknown;
	if (w.generated != null && now - w.generated > RAIN_MAX_AGE_S) return unknown;
	const step = rain.stepMinutes ?? 15;
	const rates = rain.mmPerStep.map((mm) => (mm * 60) / step);
	const wet = rain.mmPerStep.map((mm) => mm > WET_STEP_MM);
	const first = wet.indexOf(true);
	const top = Math.max(3, ...rates);
	const bars = rates.map((r, i): RainBar => {
		if (!wet[i]) return { pct: 8, tone: 'dry' };
		// The square root keeps a light rain visible next to a downpour.
		return { pct: Math.min(100, Math.max(22, Math.round(Math.sqrt(r / top) * 100))), tone: rainTone(r) };
	});
	if (first < 0) return { status: 'none', inMin: null, forMin: null, maxMmH: 0, stepMinutes: step, bars };
	let last = first;
	while (last + 1 < wet.length && wet[last + 1]) last++;
	return {
		status: first === 0 ? 'now' : 'soon',
		inMin: first * step,
		forMin: (last - first + 1) * step,
		maxMmH: Math.max(...rates.filter((_, i) => wet[i])),
		stepMinutes: step,
		bars
	};
}

// --- the official warnings at the place ---------------------------------------------------------------------------------------------

export interface VigilanceView {
	state: OfficialState;
	/** The highest level among the warnings that hold the place; null without any. */
	level: Level | null;
	/** The phenomena at that level, as the issuer or the site names them, without repeats. */
	labels: string[];
	/** When the last of them ends (epoch seconds); null when none says. */
	until: number | null;
	/** How many other phenomena are in force at a lower level. */
	more: number;
}

export function vigilanceView(
	state: OfficialState,
	here: WarningHere[],
	label: (w: WarningHere['warning']) => string | null,
	now: number
): VigilanceView {
	const live = here.filter((h) => {
		const end = h.warning.ends ?? h.warning.expires;
		return end == null || end > now;
	});
	if (state !== 'warnings' || live.length === 0)
		return { state: state === 'warnings' ? 'none' : state, level: null, labels: [], until: null, more: 0 };
	const top = Math.max(...live.map((h) => rank(h.warning.level)));
	const highest = live.filter((h) => rank(h.warning.level) === top);
	const labels = [...new Set(highest.map((h) => label(h.warning)).filter((l): l is string => !!l))];
	const ends = highest.map((h) => h.warning.ends ?? h.warning.expires).filter((t): t is number => t != null);
	const others = new Set(
		live
			.filter((h) => rank(h.warning.level) !== top)
			.map((h) => label(h.warning) ?? h.warning.id)
			.filter((l) => !labels.includes(l))
	);
	return {
		state,
		level: highest[0].warning.level,
		labels,
		until: ends.length ? Math.max(...ends) : null,
		more: others.size
	};
}

// --- the wind measured now -----------------------------------------------------------------------------------------------------------

/** A station farther than this measures somewhere else. */
export const WIND_MAX_KM = 25;
/** An observation older than this is not "now". */
export const WIND_MAX_AGE_S = 90 * 60;
/** A summit measures the wind of the crest, not of the town below: left out unless it is the only one. */
const SUMMIT_M = 900;

export interface MeasuredWind {
	point: WindPoint;
	km: number;
	ageMin: number;
}

export function nearestWind(points: WindPoint[], place: Place, now: number): MeasuredWind | null {
	const fresh = points
		.filter((p) => now - p.measured <= WIND_MAX_AGE_S)
		.map((point) => ({ point, km: distanceKm(place, point) }))
		.filter((x) => x.km <= WIND_MAX_KM)
		.sort((a, b) => a.km - b.km);
	const best = fresh.find((x) => (x.point.altM ?? 0) < SUMMIT_M) ?? fresh[0];
	if (!best) return null;
	return { ...best, ageMin: Math.max(0, Math.round((now - best.point.measured) / 60)) };
}

/**
 * The box of `/data/wind.json` around the cell of the grid: whole degrees, as the site wants them (its answers are then few and
 * shared), wide enough to hold every station within `WIND_MAX_KM`.
 */
export function windBox(cell: Place): [number, number, number, number] {
	const lat = WIND_MAX_KM / 111;
	const lon = Math.min(1, lat / Math.max(0.2, Math.cos((cell.lat * Math.PI) / 180)));
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	return [
		clamp(Math.floor(cell.lon - lon), -180, 180),
		clamp(Math.floor(cell.lat - lat), -90, 90),
		clamp(Math.ceil(cell.lon + lon), -180, 180),
		clamp(Math.ceil(cell.lat + lat), -90, 90)
	];
}

/** The name of a phenomenon in a few words: the site's own label, else the issuer's (without its level). */
export function phenomenonLabel(
	warning: WarningHere['warning'],
	siteLabel: (phenomenon: string) => string | null,
	issuerLabel: (w: WarningHere['warning']) => string | null
): string | null {
	const own = warning.phenomenon && warning.phenomenon !== 'other' ? siteLabel(warning.phenomenon) : null;
	if (own) return own;
	const issuer = issuerLabel(warning);
	if (!issuer) return null;
	const bare = issuer.replace(
		/^(vigilance|warning|avertissement)\s+(rouge|orange|jaune|verte|red|orange|yellow|green)\s+/i,
		''
	);
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

// --- the gusts AROME-PI forecasts (France) --------------------------------------------------------------------------------------------

export function gustForecast(w: PointWeather | null, now: number): { kmh: number; at: number } | null {
	const g = w?.shortTerm?.gust;
	if (!g || g.level === 'none' || g.maxKmh == null || g.at == null || g.at < now - 900) return null;
	return { kmh: g.maxKmh, at: g.at };
}

// --- the surf spot -------------------------------------------------------------------------------------------------------------------

const VERDICT_ORDER = { good: 0, possible: 1, poor: 2 } as const;

/** The activity a small widget names: the best verdict, the first in the site's order on a tie. */
export function featured(activities: TvActivity[]): TvActivity | null {
	const judged = activities.filter((a) => a.available && a.verdict);
	return (
		[...judged].sort((a, b) => VERDICT_ORDER[a.verdict!] - VERDICT_ORDER[b.verdict!])[0] ??
		activities[0] ??
		null
	);
}

// --- the colours ---------------------------------------------------------------------------------------------------------------------

const RAMP: [number, string][] = [
	[-10, '#8FC4FF'],
	[0, '#62D8FF'],
	[12, '#84E8A0'],
	[24, '#FFCB52'],
	[36, '#FF7555']
];
const RAMP_LIGHT: [number, string][] = [
	[-10, '#2F6FDB'],
	[0, '#0A88B8'],
	[12, '#2E9E55'],
	[24, '#C77A00'],
	[36, '#D0391E']
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The colour of a temperature on the charter's ramp (cold blue to hot red), darker on the light theme. */
export function tempColour(t: number, theme: WidgetTheme): string {
	const ramp = theme === 'light' ? RAMP_LIGHT : RAMP;
	if (t <= ramp[0][0]) return ramp[0][1];
	for (let i = 1; i < ramp.length; i++) {
		const [t1, c1] = ramp[i];
		const [t0, c0] = ramp[i - 1];
		if (t <= t1) {
			const k = (t - t0) / (t1 - t0);
			const a = rgb(c0),
				b = rgb(c1);
			return `#${a
				.map((v, j) =>
					Math.round(v + (b[j] - v) * k)
						.toString(16)
						.padStart(2, '0')
				)
				.join('')}`;
		}
	}
	return ramp[ramp.length - 1][1];
}

// --- the sky -------------------------------------------------------------------------------------------------------------------------

export type SkyKind =
	'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'snow' | 'storm';

/** The picture of a WMO weather code. */
export function skyKind(code: number | null): SkyKind {
	if (code == null) return 'cloudy';
	if (code <= 1) return 'clear';
	if (code === 2) return 'partly';
	if (code === 3) return 'cloudy';
	if (code === 45 || code === 48) return 'fog';
	if (code >= 51 && code <= 57) return 'drizzle';
	if ((code >= 61 && code <= 67) || code === 80) return 'rain';
	if (code >= 81 && code <= 82) return 'showers';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if (code >= 95) return 'storm';
	return 'cloudy';
}

/** A time of day in the reader's own clock: `11 h 30` or `11 h` in French, `11:30` in English. */
export function clockLabel(lang: Lang, unix: number, timeZone?: string): string {
	const [h, m] = new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone
	})
		.format(new Date(unix * 1000))
		.split(':');
	if (lang === 'en') return `${h}:${m}`;
	return m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`;
}

/** The surf model writes a time as `20:32`; in French the widget writes it as its other sentences do: `20 h 32`, `14 h`. */
export function frenchClock(text: string): string {
	return text.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) =>
		m === '00' ? `${Number(h)} h` : `${Number(h)} h ${m}`
	);
}

/** The short name of a day of the forecast (`Dim`, `Sun`), from its date. */
export function dayLabel(lang: Lang, date: string): string {
	const word = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		weekday: 'short',
		timeZone: 'UTC'
	})
		.format(Date.parse(`${date}T12:00:00Z`))
		.replace('.', '');
	return word.charAt(0).toUpperCase() + word.slice(1);
}

export interface DayView {
	date: string;
	code: number | null;
	maxC: number | null;
	minC: number | null;
}

/** The days of the forecast from today on (by the place's own date when the API gave its offset), at most `count`. */
export function daysView(w: PointWeather | null, now: number, count = 5): DayView[] {
	if (!w) return [];
	const today = new Date((now + (w.utcOffsetS ?? 0)) * 1000).toISOString().slice(0, 10);
	return w.daily
		.filter((d) => d.date >= today)
		.slice(0, count)
		.map((d) => ({ date: d.date, code: d.code, maxC: d.tmaxC, minC: d.tminC }));
}
