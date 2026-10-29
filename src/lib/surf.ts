// The surf forecast of the API (vigie-api `GET /v1/surf/spots`, `GET /v1/surf/spots/{id}`): the spots of the French Atlantic and
// Channel coasts (OpenStreetMap), and for one of them the swell (MFWAM), the wind and the tide hour by hour, with the API's own
// rating, criterion by criterion. Every figure is the API's; a value it did not give is left out, never guessed.
import type { Lang } from './i18n';

export type Criterion = 'swell_height' | 'swell_period' | 'swell_direction' | 'wind' | 'tide';
const CRITERIA: Criterion[] = ['swell_height', 'swell_period', 'swell_direction', 'wind', 'tide'];

export interface SurfSpot {
	id: string;
	name: string;
	place: string | null;
	lat: number;
	lon: number;
	/** Direction from the beach to the open sea, degrees from north (the API's, from the coastline). */
	facing: number;
}

export interface SurfSpots {
	spots: SurfSpot[];
	attribution: string | null;
}

export interface Swell {
	height: number | null;
	period: number | null;
	/** Where the waves come from, degrees from north. */
	from: number | null;
}

export interface CriterionScore {
	name: Criterion;
	value: number | null;
	unit: string;
	/** null: the value, or what it is compared with, is unknown. */
	points: number | null;
	max: number;
}

export interface SurfRating {
	points: number;
	outOf: number;
	criteria: CriterionScore[];
	unknown: Criterion[];
}

export interface SurfHour {
	t: number;
	daylight: boolean | null;
	swell: Swell;
	secondary: Swell;
	power: number | null;
	angle: number | null;
	wind: {
		speed: number | null;
		gust: number | null;
		from: number | null;
		relative: 'offshore' | 'cross-shore' | 'onshore' | null;
	};
	tide: { height: number; trend: 'rising' | 'falling'; stage: 'low' | 'mid' | 'high' | null } | null;
	rating: SurfRating | null;
}

export interface SurfForecast {
	generated: number;
	spot: SurfSpot;
	model: string | null;
	hours: SurfHour[];
	best: { t: number; rating: SurfRating } | null;
	rules: Partial<Record<Criterion | 'best_slot', string>>;
	limits: string | null;
	disclaimer: string | null;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function spotFromApi(raw: unknown): SurfSpot | null {
	const s = obj(raw);
	const id = str(s.id);
	const name = str(s.name);
	const lat = num(s.lat);
	const lon = num(s.lon);
	const facing = num(s.facing_deg);
	if (!id || !name || lat == null || lon == null || facing == null) return null;
	return { id, name, place: str(s.place), lat, lon, facing };
}

/** The spots, north to south (the coast from the Channel down to the Basque Country). */
export function surfSpotsFromApi(raw: unknown): SurfSpots {
	const r = obj(raw);
	const spots = (Array.isArray(r.spots) ? r.spots : [])
		.map(spotFromApi)
		.filter((s): s is SurfSpot => s != null)
		.sort((a, b) => b.lat - a.lat);
	return { spots, attribution: str(r.attribution) };
}

function swellFromApi(raw: unknown): Swell {
	const s = obj(raw);
	return { height: num(s.height_m), period: num(s.period_s), from: num(s.from_deg) };
}

function ratingFromApi(raw: unknown): SurfRating | null {
	const r = obj(raw);
	const points = num(r.points);
	const outOf = num(r.out_of);
	if (points == null || outOf == null) return null;
	const criteria = (Array.isArray(r.criteria) ? r.criteria : []).flatMap((c): CriterionScore[] => {
		const x = obj(c);
		const name = x.name as Criterion;
		const max = num(x.max_points);
		if (!CRITERIA.includes(name) || max == null) return [];
		return [{ name, value: num(x.value), unit: str(x.unit) ?? '', points: num(x.points), max }];
	});
	const unknown = (Array.isArray(r.unknown) ? r.unknown : []).filter((u): u is Criterion =>
		CRITERIA.includes(u as Criterion)
	);
	return { points, outOf, criteria, unknown };
}

function hourFromApi(raw: unknown): SurfHour | null {
	const h = obj(raw);
	const t = num(h.time_utc);
	if (t == null) return null;
	const wind = obj(h.wind);
	const relative = wind.relative;
	const tide = obj(h.tide);
	const tideHeight = num(tide.height_m);
	const stage = tide.stage;
	return {
		t,
		daylight: typeof h.daylight === 'boolean' ? h.daylight : null,
		swell: swellFromApi(h.swell),
		secondary: swellFromApi(h.secondary_swell),
		power: num(h.swell_power_kw_m),
		angle: num(h.swell_angle_deg),
		wind: {
			speed: num(wind.speed_kmh),
			gust: num(wind.gust_kmh),
			from: num(wind.from_deg),
			relative:
				relative === 'offshore' || relative === 'cross-shore' || relative === 'onshore' ? relative : null
		},
		tide:
			tideHeight != null && (tide.trend === 'rising' || tide.trend === 'falling')
				? {
						height: tideHeight,
						trend: tide.trend,
						stage: stage === 'low' || stage === 'mid' || stage === 'high' ? stage : null
					}
				: null,
		rating: h.rating ? ratingFromApi(h.rating) : null
	};
}

export function surfForecastFromApi(raw: unknown): SurfForecast | null {
	const r = obj(raw);
	const spot = spotFromApi(r.spot);
	const generated = num(r.generated_utc);
	if (!spot || generated == null) return null;
	const hours = (Array.isArray(r.hours) ? r.hours : [])
		.map(hourFromApi)
		.filter((h): h is SurfHour => h != null)
		.sort((a, b) => a.t - b.t);
	const best = obj(r.best_slot);
	const bestT = num(best.time_utc);
	const bestRating = r.best_slot ? ratingFromApi(best.rating) : null;
	const rules: SurfForecast['rules'] = {};
	for (const [k, v] of Object.entries(obj(r.rules))) {
		if ((CRITERIA as string[]).includes(k) || k === 'best_slot') {
			const text = str(v);
			if (text) rules[k as Criterion | 'best_slot'] = text;
		}
	}
	return {
		generated,
		spot,
		model: str(r.swell_model),
		hours,
		best: bestT != null && bestRating ? { t: bestT, rating: bestRating } : null,
		rules,
		limits: str(r.limits),
		disclaimer: str(r.disclaimer),
		attribution: str(r.attribution)
	};
}

// --- what the page shows ----------------------------------------------------------------------------------------------

/** The box of the API's spots (the French coasts from Hendaye to the north of Brittany), with some 30 km to spare: a tide
 *  shown in it links to the surf forecast. */
const SURF_BOX = { west: -5.2, south: 43.1, east: -0.8, north: 49.1 } as const;

export function nearSurfSpots(at: { lat: number; lon: number } | null): boolean {
	return (
		at != null &&
		at.lat >= SURF_BOX.south &&
		at.lat <= SURF_BOX.north &&
		at.lon >= SURF_BOX.west &&
		at.lon <= SURF_BOX.east
	);
}

/** The spots are all in France: times are shown in its time zone, the same on the server and in the browser. */
export const SURF_TIME_ZONE = 'Europe/Paris';

const COMPASS = {
	fr: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
	en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
} as const;

/** A direction in degrees as one of the 16 points of the compass. */
export function compass(lang: Lang, deg: number): string {
	return COMPASS[lang][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** The day of an hour in the spots' time zone, as a key (`2026-10-29`) and as words. */
export function dayKey(t: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: SURF_TIME_ZONE, dateStyle: 'short' }).format(t * 1000);
}

export function dayLabel(lang: Lang, t: number): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		timeZone: SURF_TIME_ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(t * 1000);
}

export function hourLabel(lang: Lang, t: number): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		timeZone: SURF_TIME_ZONE,
		hour: '2-digit',
		minute: '2-digit'
	}).format(t * 1000);
}

/** The hours of each day, in order; only the daylight ones unless `night` (an hour whose daylight is unknown is kept). */
export function hoursByDay(
	hours: SurfHour[],
	night = false
): { key: string; t: number; hours: SurfHour[] }[] {
	const days: { key: string; t: number; hours: SurfHour[] }[] = [];
	for (const h of hours) {
		if (!night && h.daylight === false) continue;
		const key = dayKey(h.t);
		const last = days.at(-1);
		if (last && last.key === key) last.hours.push(h);
		else days.push({ key, t: h.t, hours: [h] });
	}
	return days;
}

/** A share of points from 0 to 1, for the colour of a rating; null when nothing could be scored. */
export function share(r: SurfRating | null): number | null {
	return r && r.outOf > 0 ? r.points / r.outOf : null;
}

const fmt = (lang: Lang, v: number, digits = 1) =>
	v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: digits });

/** A swell in a few characters: `1,5 m · 9 s · ONO`; a part the API did not give is left out. */
export function swellText(lang: Lang, s: Swell): string | null {
	const parts = [
		s.height != null ? `${fmt(lang, s.height)} m` : null,
		s.period != null ? `${fmt(lang, s.period, 0)} s` : null,
		s.from != null ? compass(lang, s.from) : null
	].filter((p): p is string => p != null);
	return parts.length ? parts.join(' · ') : null;
}

export function windText(lang: Lang, w: SurfHour['wind']): string | null {
	const parts = [
		w.speed != null ? `${fmt(lang, w.speed, 0)} km/h` : null,
		w.gust != null ? `${surfText(lang, 'gusts')} ${fmt(lang, w.gust, 0)}` : null,
		w.from != null ? compass(lang, w.from) : null
	].filter((p): p is string => p != null);
	return parts.length ? parts.join(' · ') : null;
}

/** The value of a criterion as the API compared it, with its unit. */
export function criterionValue(lang: Lang, c: CriterionScore): string | null {
	if (c.value == null) return null;
	const unit = c.unit === 'deg' ? '°' : ` ${c.unit}`;
	return `${fmt(lang, c.value, c.unit === 's' || c.unit === 'km/h' || c.unit === 'deg' ? 0 : 1)}${unit}`;
}

const TEXT = {
	fr: {
		page: 'Surf',
		pageIntro:
			'La houle, le vent et la marée heure par heure sur une cinquantaine de spots de l’Atlantique et de la Manche, et une note à nous, expliquée critère par critère.',
		safety:
			'Pas pour la sécurité ni pour la navigation : regarder la mer sur place, les drapeaux et les sauveteurs avant d’y aller.',
		spots: 'Les spots, du nord au sud',
		spotsNote:
			'Les spots viennent d’OpenStreetMap ; la direction vers laquelle chaque plage regarde est calculée par Vigie à partir du trait de côte. Le fond, la marée et la houle qui conviennent à chaque spot ne sont pas connus : rien n’est deviné.',
		unavailable: 'La prévision de surf ne répond pas pour le moment.',
		facing: 'Plage tournée vers {dir} ({deg}°)',
		back: 'Tous les spots',
		best: 'Le meilleur créneau des 3 prochains jours',
		bestNone: 'Aucune heure de jour des 3 prochains jours n’a pu être notée.',
		points: '{points} points sur {outOf}',
		why: 'Pourquoi cette note',
		hours: 'Heure par heure',
		hoursNote: 'Heures de jour, heure de France. Ouvrir une heure pour voir sa note critère par critère.',
		showNight: 'Montrer aussi les heures de nuit',
		swell: 'Houle',
		secondary: 'Houle secondaire',
		power: 'Énergie',
		wind: 'Vent',
		gusts: 'rafales',
		tide: 'Marée',
		rating: 'Note',
		noRating: 'pas de note',
		unknownValue: 'inconnu',
		notScored: 'pas compté',
		'relative.offshore': 'de terre',
		'relative.cross-shore': 'parallèle à la côte',
		'relative.onshore': 'de mer',
		'trend.rising': 'montante',
		'trend.falling': 'descendante',
		'stage.low': 'tiers bas',
		'stage.mid': 'mi-marée',
		'stage.high': 'tiers haut',
		'criterion.swell_height': 'Hauteur de la houle',
		'criterion.swell_period': 'Période de la houle',
		'criterion.swell_direction': 'Angle de la houle avec la plage',
		'criterion.wind': 'Vent',
		'criterion.tide': 'Marée',
		ours: 'La note est une règle à nous : quelques seuils, donnés ici ; elle ne connaît ni le spot ni le surfeur.',
		model: 'Houle : {model}.',
		updated: 'Prévision calculée à {time}.',
		limits: 'Ce que la prévision ne voit pas',
		tideLink: 'La prévision de surf des spots'
	},
	en: {
		page: 'Surf',
		pageIntro:
			'The swell, the wind and the tide hour by hour at some fifty spots of the Atlantic and the Channel, and a rating of ours, explained criterion by criterion.',
		safety:
			'Not for safety and not for navigation: look at the sea on the spot, the flags and the lifeguards before going in.',
		spots: 'The spots, north to south',
		spotsNote:
			'The spots come from OpenStreetMap; the direction each beach faces is worked out by Vigie from the coastline. The bottom, and the tide and swell each spot works best with, are not known: nothing is guessed.',
		unavailable: 'The surf forecast does not answer at the moment.',
		facing: 'Beach facing {dir} ({deg}°)',
		back: 'All the spots',
		best: 'The best slot of the next 3 days',
		bestNone: 'No daylight hour of the next 3 days could be rated.',
		points: '{points} points out of {outOf}',
		why: 'Why this rating',
		hours: 'Hour by hour',
		hoursNote: 'Daylight hours, French time. Open an hour to see its rating criterion by criterion.',
		showNight: 'Show the night hours too',
		swell: 'Swell',
		secondary: 'Secondary swell',
		power: 'Power',
		wind: 'Wind',
		gusts: 'gusts',
		tide: 'Tide',
		rating: 'Rating',
		noRating: 'no rating',
		unknownValue: 'unknown',
		notScored: 'not counted',
		'relative.offshore': 'offshore',
		'relative.cross-shore': 'cross-shore',
		'relative.onshore': 'onshore',
		'trend.rising': 'rising',
		'trend.falling': 'falling',
		'stage.low': 'low third',
		'stage.mid': 'mid tide',
		'stage.high': 'high third',
		'criterion.swell_height': 'Swell height',
		'criterion.swell_period': 'Swell period',
		'criterion.swell_direction': 'Swell angle to the beach',
		'criterion.wind': 'Wind',
		'criterion.tide': 'Tide',
		ours: 'The rating is a rule of ours: a few thresholds, given here; it knows neither the spot nor the surfer.',
		model: 'Swell: {model}.',
		updated: 'Forecast worked out at {time}.',
		limits: 'What the forecast does not see',
		tideLink: 'The surf forecast of the spots'
	}
} as const;

export type SurfKey = keyof (typeof TEXT)['fr'];

export function surfText(
	lang: Lang,
	key: SurfKey | string,
	vars: Record<string, string | number> = {}
): string {
	const table = TEXT[lang] as Record<string, string>;
	let text = table[key] ?? (TEXT.fr as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}
