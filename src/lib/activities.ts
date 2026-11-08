// The verdicts of the API for one surf spot (vigie-api `GET /v1/activities/{spot_id}`, ADR 0016 of the API): for surf, kite
// (wing, windsurf), boat and shore fishing, a verdict hour by hour (good, possible or poor), the best slot of the next 24
// hours, the criteria behind it, the tide and the coastal warnings. Every verdict is a rule of Vigie, written in `rules`. And
// the nearest CANDHIS wave buoy of every spot (`GET /v1/surf/buoys`). Every figure is the API's; what it did not give is
// left out, never guessed.
import { number } from './format';
import type { Lang } from './i18n';
import type { WindUnit } from './sea/choice';
import { windText } from './sea/units';
import { dayKey, SURF_TIME_ZONE, type SurfSpot } from './surf';

export type Verdict = 'good' | 'possible' | 'poor';
export type ActivityId = 'surf' | 'kite' | 'boat' | 'shore_fishing';
export const ACTIVITY_IDS: ActivityId[] = ['surf', 'kite', 'boat', 'shore_fishing'];
const VERDICTS: Verdict[] = ['good', 'possible', 'poor'];

export interface ActivityCriterion {
	name: string;
	value: number | null;
	unit: string;
	/** What the rule makes of the value, as the API's code (`too_small`, `in_range`...). */
	state: string | null;
	verdict: Verdict | null;
	/** Surf only: the points of the rating. */
	points: number | null;
	max: number | null;
}

export interface ActivityHour {
	t: number;
	daylight: boolean | null;
	verdict: Verdict | null;
	/** `<criterion>.<state>` of the criterion that keeps the hour from being good, or `vigilance.red` / `vigilance.orange`. */
	reason: string | null;
}

export interface Activity {
	id: ActivityId;
	/** False where the activity cannot be judged here (no tide model near, for shore fishing). */
	available: boolean;
	/** The best verdict of the daylight hours of the next 24 hours. */
	verdict: Verdict | null;
	reason: string | null;
	/** The longest run of daylight hours at that verdict; null when it is poor. */
	slot: { start: number; end: number } | null;
	hours: ActivityHour[];
	/** The hour the verdict stands on, with its criteria. */
	detail: {
		t: number;
		verdict: Verdict | null;
		reason: string | null;
		criteria: ActivityCriterion[];
		points: number | null;
		outOf: number | null;
	} | null;
	note: string | null;
}

export interface TideExtreme {
	t: number;
	kind: 'high' | 'low';
	height: number;
}

export interface CoastalAlert {
	id: string;
	source: string;
	level: string | null;
	attribution: string | null;
}

export interface ActivitiesForecast {
	generated: number;
	spot: SurfSpot;
	windRange: { min: number; max: number } | null;
	activities: Activity[];
	tide: {
		extremes: TideExtreme[];
		/** The coefficient Vigie estimates for the high water at Brest at that time (not the SHOM's). */
		coefficients: { t: number; value: number }[];
		note: string | null;
	} | null;
	vigilance: { status: 'ok' | 'unknown'; alerts: CoastalAlert[] };
	/** Sunrise and sunset of each day of the forecast, UTC epoch seconds. */
	sun: { rise: number; set: number }[];
	rules: Record<string, string>;
	limits: string | null;
	disclaimer: string | null;
	stale: boolean;
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const verdictOf = (v: unknown): Verdict | null => (VERDICTS.includes(v as Verdict) ? (v as Verdict) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function criterionFromApi(raw: unknown): ActivityCriterion | null {
	const c = obj(raw);
	const name = str(c.name);
	if (!name) return null;
	return {
		name,
		value: num(c.value),
		unit: str(c.unit) ?? '',
		state: str(c.state),
		verdict: verdictOf(c.verdict),
		points: num(c.points),
		max: num(c.max_points)
	};
}

function hourFromApi(raw: unknown): ActivityHour | null {
	const h = obj(raw);
	const t = num(h.time_utc);
	if (t == null) return null;
	return {
		t,
		daylight: typeof h.daylight === 'boolean' ? h.daylight : null,
		verdict: verdictOf(h.verdict),
		reason: str(h.reason)
	};
}

function activityFromApi(raw: unknown): Activity | null {
	const a = obj(raw);
	const id = a.id as ActivityId;
	if (!ACTIVITY_IDS.includes(id)) return null;
	const slot = obj(a.best_slot);
	const start = num(slot.start_utc);
	const end = num(slot.end_utc);
	const d = obj(a.detail);
	const detailT = num(d.time_utc);
	return {
		id,
		available: a.available === true,
		verdict: verdictOf(a.verdict),
		reason: str(a.reason),
		slot: start != null && end != null && end > start ? { start, end } : null,
		hours: list(a.hours)
			.map(hourFromApi)
			.filter((h): h is ActivityHour => h != null)
			.sort((x, y) => x.t - y.t),
		detail:
			detailT != null
				? {
						t: detailT,
						verdict: verdictOf(d.verdict),
						reason: str(d.reason),
						criteria: list(d.criteria)
							.map(criterionFromApi)
							.filter((c): c is ActivityCriterion => c != null),
						points: num(d.points),
						outOf: num(d.out_of)
					}
				: null,
		note: str(a.note)
	};
}

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

export function activitiesFromApi(raw: unknown): ActivitiesForecast | null {
	const r = obj(raw);
	const spot = spotFromApi(r.spot);
	const generated = num(r.generated_utc);
	if (!spot || generated == null) return null;
	const activities = list(r.activities)
		.map(activityFromApi)
		.filter((a): a is Activity => a != null)
		.sort((x, y) => ACTIVITY_IDS.indexOf(x.id) - ACTIVITY_IDS.indexOf(y.id));
	const range = obj(r.wind_range);
	const tide = obj(r.tide);
	const vigilance = obj(r.vigilance);
	const rules: Record<string, string> = {};
	for (const [k, v] of Object.entries(obj(r.rules))) {
		const text = str(v);
		if (text) rules[k] = text;
	}
	return {
		generated,
		spot,
		windRange:
			num(range.min_kn) != null && num(range.max_kn) != null
				? { min: num(range.min_kn)!, max: num(range.max_kn)! }
				: null,
		activities,
		tide: r.tide
			? {
					extremes: list(tide.extremes).flatMap((e): TideExtreme[] => {
						const x = obj(e);
						const t = num(x.time_utc);
						const height = num(x.height_m);
						return t != null && height != null && (x.kind === 'high' || x.kind === 'low')
							? [{ t, kind: x.kind, height }]
							: [];
					}),
					coefficients: list(tide.coefficients_estimated).flatMap((c) => {
						const x = obj(c);
						const t = num(x.brest_high_water_utc);
						const value = num(x.value);
						return t != null && value != null ? [{ t, value }] : [];
					}),
					note: str(tide.note)
				}
			: null,
		// Warnings that could not be read are not "none": the status says it, and the page says it.
		vigilance: {
			status: vigilance.status === 'ok' ? 'ok' : 'unknown',
			alerts: list(vigilance.alerts).flatMap((a): CoastalAlert[] => {
				const x = obj(a);
				const id = str(x.id);
				const source = str(x.source);
				return id && source ? [{ id, source, level: str(x.level), attribution: str(x.attribution) }] : [];
			})
		},
		sun: list(r.sun).flatMap((d): { rise: number; set: number }[] => {
			const x = obj(d);
			const rise = num(x.sunrise_utc);
			const set = num(x.sunset_utc);
			return rise != null && set != null && set > rise ? [{ rise, set }] : [];
		}),
		rules,
		limits: str(r.limits),
		disclaimer: str(r.disclaimer),
		stale: r.stale === true,
		attribution: str(r.attribution)
	};
}

// --- the nearest wave buoy of every spot (`GET /v1/surf/buoys`) ----------------------------------------------------------

export interface Buoy {
	id: string;
	name: string;
	/** True only for a station that CANDHIS marked real time when its list was read; null for the others (unknown). */
	realTime: boolean | null;
}

export interface SpotBuoy {
	spotId: string;
	buoy: Buoy | null;
	km: number | null;
	/** The nearest station marked real time, when it is not the nearest one. */
	realTimeBuoy: Buoy | null;
	realTimeKm: number | null;
	/** Close enough for its waves to say something of the spot: the distance alone, not the shelter of the beach. */
	comparable: boolean;
}

export interface SurfBuoys {
	spots: SpotBuoy[];
	maxComparableKm: number | null;
	attribution: string | null;
}

function buoyFromApi(raw: unknown): Buoy | null {
	const b = obj(raw);
	const id = str(b.id);
	const name = str(b.name);
	if (!id || !name) return null;
	return { id, name, realTime: typeof b.real_time === 'boolean' ? b.real_time : null };
}

export function buoysFromApi(raw: unknown): SurfBuoys {
	const r = obj(raw);
	const spots = list(r.spots).flatMap((s): SpotBuoy[] => {
		const x = obj(s);
		const spotId = str(x.spot_id);
		if (!spotId) return [];
		return [
			{
				spotId,
				buoy: buoyFromApi(x.buoy),
				km: num(x.distance_km),
				realTimeBuoy: buoyFromApi(x.real_time_buoy),
				realTimeKm: num(x.real_time_distance_km),
				comparable: x.comparable === true
			}
		];
	});
	return { spots, maxComparableKm: num(r.max_comparable_km), attribution: str(r.attribution) };
}

/** The buoy of a spot; null for a spot the list does not have, or one without a station. */
export function buoyOf(buoys: SurfBuoys, spotId: string): SpotBuoy | null {
	const found = buoys.spots.find((s) => s.spotId === spotId);
	return found && found.buoy ? found : null;
}

// --- what the page shows --------------------------------------------------------------------------------------------------

const hourNumber = (t: number): number =>
	Number(
		new Intl.DateTimeFormat('en-GB', { timeZone: SURF_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(
			t * 1000
		)
	);

export interface VerdictDay {
	key: string;
	t: number;
	/** The hours of the day, in order (the daylight ones unless `night`). */
	hours: number[];
}

/** The days of the forecast and their hours, taken from the activity that has the most; the same hours serve every activity. */
export function verdictDays(activities: Activity[], night = false): VerdictDay[] {
	const source = activities.reduce<Activity | null>(
		(best, a) => (a.hours.length > (best?.hours.length ?? 0) ? a : best),
		null
	);
	const days: VerdictDay[] = [];
	for (const h of source?.hours ?? []) {
		if (!night && h.daylight === false) continue;
		const key = dayKey(h.t);
		const last = days.at(-1);
		if (last && last.key === key) last.hours.push(h.t);
		else days.push({ key, t: h.t, hours: [h.t] });
	}
	return days;
}

/** An hour's hand: its hour of the day (0 to 23) when it is a multiple of `every`, for the axis. */
export function axisHour(t: number, every = 3): number | null {
	const h = hourNumber(t);
	return h % every === 0 ? h : null;
}

/** The hours of a day as runs of one verdict, for a text that says what the bars show: `[{ verdict, from, to }]`. */
export function verdictRuns(
	hours: ActivityHour[],
	times: number[]
): { verdict: Verdict | null; from: number; to: number }[] {
	const byTime = new Map(hours.map((h) => [h.t, h.verdict]));
	const runs: { verdict: Verdict | null; from: number; to: number }[] = [];
	for (const t of times) {
		const verdict = byTime.get(t) ?? null;
		const last = runs.at(-1);
		if (last && last.verdict === verdict && t - last.to <= 3600) last.to = t;
		else runs.push({ verdict, from: t, to: t });
	}
	return runs;
}

/** Height of the bar of a verdict in the strip, as a share of the cell: the shape says it without the colour. */
export const BAR_HEIGHT: Record<Verdict, number> = { good: 100, possible: 66, poor: 33 };

/** The high and low waters of a day (in the spots' time zone), and the estimated coefficient of its Brest high waters. */
export function tideOfDay(
	tide: ActivitiesForecast['tide'],
	key: string
): { extremes: TideExtreme[]; coefficients: number[] } {
	if (!tide) return { extremes: [], coefficients: [] };
	return {
		extremes: tide.extremes.filter((e) => dayKey(e.t) === key),
		coefficients: tide.coefficients.filter((c) => dayKey(c.t) === key).map((c) => c.value)
	};
}

const CRITERION = {
	fr: {
		wind: 'Vent',
		gust_gap: 'Écart des rafales avec le vent',
		wind_direction: 'Côté d’où vient le vent',
		wind_force: 'Force du vent',
		gust_force: 'Force des rafales',
		sea_height: 'Hauteur des vagues',
		low_water: 'Avant la basse mer',
		coefficient: 'Coefficient (estimé par Vigie)',
		swell_height: 'Hauteur de la houle',
		swell_period: 'Période de la houle',
		swell_direction: 'Angle de la houle avec la plage',
		tide: 'Marée',
		vigilance: 'Vigilance côtière'
	},
	en: {
		wind: 'Wind',
		gust_gap: 'Gusts above the wind',
		wind_direction: 'Side the wind comes from',
		wind_force: 'Wind force',
		gust_force: 'Gust force',
		sea_height: 'Wave height',
		low_water: 'Before the low water',
		coefficient: 'Coefficient (estimated by Vigie)',
		swell_height: 'Swell height',
		swell_period: 'Swell period',
		swell_direction: 'Swell angle to the beach',
		tide: 'Tide',
		vigilance: 'Coastal warning'
	}
} as const;

/** What a rule made of a value, keyed `<criterion>.<state>`: the API's codes, in the reader's words. */
const STATE = {
	fr: {
		'swell_height.too_small': 'trop petite',
		'swell_height.small': 'petite',
		'swell_height.right': 'bonne',
		'swell_height.big': 'forte',
		'swell_height.too_big': 'trop forte',
		'swell_period.short': 'courte',
		'swell_period.medium': 'moyenne',
		'swell_period.long': 'longue',
		'swell_direction.facing': 'de face',
		'swell_direction.oblique': 'de biais',
		'swell_direction.off_axis': 'hors de l’axe de la plage',
		'wind.light': 'léger',
		'wind.offshore': 'de terre',
		'wind.cross_shore': 'parallèle à la côte',
		'wind.onshore': 'de mer',
		'wind.strong': 'trop fort',
		'wind.in_range': 'dans la plage voulue',
		'wind.a_bit_light': 'un peu faible',
		'wind.a_bit_strong': 'un peu fort',
		'wind.too_light': 'trop faible',
		'wind.too_strong': 'trop fort',
		'tide.right_stage': 'bon moment de la marée',
		'tide.wrong_stage': 'mauvais moment de la marée',
		'gust_gap.steady': 'régulier',
		'gust_gap.gusty': 'rafales marquées',
		'gust_gap.very_gusty': 'rafales très marquées',
		'wind_direction.offshore': 'de terre',
		'wind_direction.cross_shore': 'parallèle à la côte',
		'wind_direction.onshore': 'de mer',
		'wind_force.up_to_moderate': 'modéré ou moins',
		'wind_force.up_to_fresh': 'frais ou moins',
		'wind_force.fresh': 'frais',
		'wind_force.strong': 'fort',
		'wind_force.strong_or_more': 'fort ou plus',
		'wind_force.near_gale_or_more': 'près du coup de vent ou plus',
		'gust_force.up_to_fresh': 'frais ou moins',
		'gust_force.strong': 'fortes',
		'gust_force.gale_or_more': 'coup de vent ou plus',
		'sea_height.low': 'faible',
		'sea_height.moderate': 'modérée',
		'sea_height.high': 'importante',
		'low_water.in_window': 'dans les 2 h avant la basse mer',
		'low_water.outside_window': 'hors des 2 h avant la basse mer',
		'coefficient.small': 'petit',
		'coefficient.moderate': 'moyen',
		'coefficient.large': 'grand',
		'coefficient.very_large': 'très fort',
		'vigilance.red': 'rouge',
		'vigilance.orange': 'orange'
	},
	en: {
		'swell_height.too_small': 'too small',
		'swell_height.small': 'small',
		'swell_height.right': 'right',
		'swell_height.big': 'big',
		'swell_height.too_big': 'too big',
		'swell_period.short': 'short',
		'swell_period.medium': 'medium',
		'swell_period.long': 'long',
		'swell_direction.facing': 'facing the beach',
		'swell_direction.oblique': 'oblique',
		'swell_direction.off_axis': 'off the axis of the beach',
		'wind.light': 'light',
		'wind.offshore': 'offshore',
		'wind.cross_shore': 'cross-shore',
		'wind.onshore': 'onshore',
		'wind.strong': 'too strong',
		'wind.in_range': 'within the range wanted',
		'wind.a_bit_light': 'a bit light',
		'wind.a_bit_strong': 'a bit strong',
		'wind.too_light': 'too light',
		'wind.too_strong': 'too strong',
		'tide.right_stage': 'the right stage of the tide',
		'tide.wrong_stage': 'the wrong stage of the tide',
		'gust_gap.steady': 'steady',
		'gust_gap.gusty': 'gusty',
		'gust_gap.very_gusty': 'very gusty',
		'wind_direction.offshore': 'offshore',
		'wind_direction.cross_shore': 'cross-shore',
		'wind_direction.onshore': 'onshore',
		'wind_force.up_to_moderate': 'moderate or less',
		'wind_force.up_to_fresh': 'fresh or less',
		'wind_force.fresh': 'fresh',
		'wind_force.strong': 'strong',
		'wind_force.strong_or_more': 'strong or more',
		'wind_force.near_gale_or_more': 'near gale or more',
		'gust_force.up_to_fresh': 'fresh or less',
		'gust_force.strong': 'strong',
		'gust_force.gale_or_more': 'gale or more',
		'sea_height.low': 'low',
		'sea_height.moderate': 'moderate',
		'sea_height.high': 'high',
		'low_water.in_window': 'within the 2 hours before the low water',
		'low_water.outside_window': 'outside the 2 hours before the low water',
		'coefficient.small': 'small',
		'coefficient.moderate': 'moderate',
		'coefficient.large': 'large',
		'coefficient.very_large': 'very large',
		'vigilance.red': 'red',
		'vigilance.orange': 'orange'
	}
} as const;

/** A criterion in the reader's words; the API's own name for one this site does not know yet. */
export function criterionName(lang: Lang, name: string): string {
	return (CRITERION[lang] as Record<string, string>)[name] ?? name;
}

/** What the rule made of a criterion; null for a code this site does not know (it is never shown raw nor guessed at). */
export function stateText(lang: Lang, name: string, state: string | null): string | null {
	if (!state) return null;
	return (STATE[lang] as Record<string, string>)[`${name}.${state}`] ?? null;
}

/** Why an hour is not good, `Hauteur de la houle : trop petite`; null for a reason this site does not know. */
export function reasonText(lang: Lang, reason: string | null): string | null {
	if (!reason) return null;
	const [name, ...rest] = reason.split('.');
	const state = stateText(lang, name, rest.join('.'));
	return state ? `${criterionName(lang, name)} : ${state}` : null;
}

/** The value of a criterion with its unit, the way the page says it; a wind in knots goes into the unit the visitor chose. */
export function criterionValueText(lang: Lang, c: ActivityCriterion, wind: WindUnit = 'kn'): string | null {
	if (c.value == null) return null;
	switch (c.unit) {
		case 'deg':
			return `${number(lang, c.value, 0)}°`;
		case 'Beaufort':
			return `force ${number(lang, c.value, 0)}`;
		case 'kn':
			return windText(lang, c.value, wind);
		case 'min':
			return lang === 'fr' ? `dans ${number(lang, c.value, 0)} min` : `in ${number(lang, c.value, 0)} min`;
		case 'm':
		case 's':
		case 'km/h':
			return `${number(lang, c.value, c.unit === 'm' ? 1 : 0)} ${c.unit}`;
		case '':
			return number(lang, c.value, 0);
		default:
			return `${number(lang, c.value, 1)} ${c.unit}`;
	}
}

const TEXT = {
	fr: {
		title: 'Aller à l’eau ?',
		intro:
			'Un verdict par activité et par heure, d’après des règles écrites par Vigie (en bas de cette section) : elles ne connaissent ni la plage, ni le fond, ni la personne qui y va. Pas pour la sécurité.',
		'activity.surf': 'Surf',
		'activity.kite': 'Kite, wing, windsurf',
		'activity.boat': 'Bateau',
		'activity.shore_fishing': 'Pêche à pied',
		'verdict.good': 'Bon',
		'verdict.possible': 'Possible',
		'verdict.poor': 'Déconseillé',
		unknown: 'Pas de verdict',
		unavailable: 'Les verdicts ne répondent pas pour le moment.',
		unavailableActivity: 'Ne peut pas être jugé ici.',
		today: 'Les 24 prochaines heures, de jour',
		slot: 'Meilleur créneau',
		noSlot: 'Aucun créneau de jour',
		why: 'Ce qui limite',
		criteria: 'Les critères de l’heure retenue',
		criteriaAt: 'Critères à {time}',
		points: 'points',
		notScored: 'pas compté',
		unknownValue: 'inconnu',
		strip: 'Heure par heure',
		stripNote:
			'La hauteur de la barre dit le verdict : haute, bon ; moyenne, possible ; basse, déconseillé ; pointillé, pas de verdict. Le trait dessous marque le meilleur créneau. Heures de France.',
		showNight: 'Montrer aussi les heures de nuit',
		barLabel: '{activity}, {day} : {runs}',
		run: '{verdict} de {from} à {to}',
		runNone: 'pas de verdict de {from} à {to}',
		tide: 'Marée',
		tideHigh: 'pleine mer',
		tideLow: 'basse mer',
		coefficient: 'coefficient estimé {value}',
		tideNote:
			'Marée calculée par Vigie, pas une table officielle ; le coefficient est une estimation de Vigie, pas celui du SHOM.',
		vigilanceNone: 'Aucune vigilance côtière officielle n’a été lue pour ce spot.',
		vigilanceUnknown:
			'Les vigilances côtières n’ont pas pu être lues : aucun verdict n’est plafonné, et leur absence ne veut pas dire qu’il n’y en a pas.',
		vigilanceIn: 'Vigilance côtière en cours',
		level: 'niveau {level}',
		stale: 'Un fournisseur n’a pas répondu : ce sont ses dernières données qui sont utilisées.',
		buoy: 'Bouée de houle la plus proche',
		buoyAt: '{name} (CANDHIS), à {km} km.',
		buoyRealTime: 'La plus proche marquée « temps réel » : {name}, à {km} km.',
		buoyFar: 'Trop loin ({max} km au plus) pour que sa houle dise quelque chose de ce spot.',
		buoyNear: 'Assez proche pour comparer sa houle à celle du spot, sans savoir si la plage est abritée.',
		buoyNotRead:
			'Vigie ne lit pas encore la mesure de cette bouée : seule sa position est donnée, la houle ci-dessus vient du modèle.',
		rules: 'Les règles de Vigie',
		limits: 'Limites',
		rule_verdict: 'Une heure',
		rule_headline: 'Le verdict du jour et le créneau',
		rule_surf: 'Surf',
		rule_kite: 'Kite, wing, windsurf',
		rule_boat: 'Bateau',
		rule_shore_fishing: 'Pêche à pied',
		rule_vigilance: 'Vigilance côtière',
		windRange: 'Plage de vent du kite : {min} à {max} nœuds.'
	},
	en: {
		title: 'Should you go?',
		intro:
			'One verdict per activity and per hour, from rules written by Vigie (at the end of this section): they know neither the beach, the bottom nor the person who goes. Not for safety.',
		'activity.surf': 'Surf',
		'activity.kite': 'Kite, wing, windsurf',
		'activity.boat': 'Boat',
		'activity.shore_fishing': 'Shore fishing',
		'verdict.good': 'Good',
		'verdict.possible': 'Possible',
		'verdict.poor': 'Poor',
		unknown: 'No verdict',
		unavailable: 'The verdicts are not answering at the moment.',
		unavailableActivity: 'Cannot be judged here.',
		today: 'The next 24 hours, in daylight',
		slot: 'Best slot',
		noSlot: 'No daylight slot',
		why: 'What holds it back',
		criteria: 'The criteria of the hour kept',
		criteriaAt: 'Criteria at {time}',
		points: 'points',
		notScored: 'not counted',
		unknownValue: 'unknown',
		strip: 'Hour by hour',
		stripNote:
			'The height of the bar is the verdict: tall, good; middle, possible; short, poor; dotted, no verdict. The line under it marks the best slot. French time.',
		showNight: 'Show the night hours too',
		barLabel: '{activity}, {day}: {runs}',
		run: '{verdict} from {from} to {to}',
		runNone: 'no verdict from {from} to {to}',
		tide: 'Tide',
		tideHigh: 'high water',
		tideLow: 'low water',
		coefficient: 'estimated coefficient {value}',
		tideNote:
			'Tide computed by Vigie, not an official table; the coefficient is Vigie’s estimate, not the SHOM’s.',
		vigilanceNone: 'No official coastal warning was read for this spot.',
		vigilanceUnknown:
			'The coastal warnings could not be read: no verdict is capped, and no warning shown does not mean there is none.',
		vigilanceIn: 'Coastal warning in force',
		level: 'level {level}',
		stale: 'A provider did not answer: its last data are used.',
		buoy: 'Nearest wave buoy',
		buoyAt: '{name} (CANDHIS), {km} km away.',
		buoyRealTime: 'Nearest one marked "real time": {name}, {km} km away.',
		buoyFar: 'Too far ({max} km at most) for its waves to say anything of this spot.',
		buoyNear:
			'Close enough to compare its waves with the spot’s, without knowing whether the beach is sheltered.',
		buoyNotRead:
			'Vigie does not read this buoy’s measurements yet: only its position is given, the swell above comes from the model.',
		rules: 'The rules of Vigie',
		limits: 'Limits',
		rule_verdict: 'One hour',
		rule_headline: 'The verdict of the day and the slot',
		rule_surf: 'Surf',
		rule_kite: 'Kite, wing, windsurf',
		rule_boat: 'Boat',
		rule_shore_fishing: 'Shore fishing',
		rule_vigilance: 'Coastal warning',
		windRange: 'Wind range of the kite: {min} to {max} knots.'
	}
} as const;

export type ActivityKey = keyof (typeof TEXT)['fr'];
/** The texts of the section, so that a test can check that both languages have every one. */
export const ACTIVITY_TEXT = TEXT;

export function activityText(
	lang: Lang,
	key: ActivityKey | string,
	vars: Record<string, string | number> = {}
): string {
	const table = TEXT[lang] as Record<string, string>;
	let text = table[key] ?? (TEXT.fr as Record<string, string>)[key] ?? key;
	for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}

/** The rules the API wrote, in English; these are their French while they are the words translated (as for the surf rating). */
const RULES_FR: Record<string, [string, string]> = {
	verdict: [
		'good, possible or poor, hour by hour: the verdict of an hour is the lowest of its criteria; a criterion whose value is unknown counts for nothing, except the one an activity cannot be judged without (kite: the wind; boat: the wind; shore fishing: the low water and the wind), which makes the verdict null; with none known the verdict is null',
		'bon, possible ou déconseillé, heure par heure : le verdict d’une heure est le plus bas de ses critères ; un critère dont la valeur est inconnue ne compte pas, sauf celui sans lequel une activité ne peut pas être jugée (kite : le vent ; bateau : le vent ; pêche à pied : la basse mer et le vent), qui rend alors le verdict nul ; si aucun n’est connu, le verdict est nul'
	],
	headline: [
		'the best verdict among the daylight hours of the next 24 hours; best_slot: the longest run of consecutive daylight hours at that verdict, the first on a tie, and none when that verdict is poor',
		'le meilleur verdict parmi les heures de jour des 24 prochaines heures ; meilleur créneau : la plus longue suite d’heures de jour consécutives à ce verdict, la première en cas d’égalité, et aucun quand ce verdict est « déconseillé »'
	],
	surf: [
		'the rating of GET /v1/surf/spots/{id} (its rules are there), by its share of points: 75 % and over good, 50 % and over possible, less poor; with fewer than three criteria known, null. A primary swell worth 0 points (under 0.5 m, or 4 m and over) makes it poor whatever the other criteria give',
		'la note de la page Surf (ses règles y sont), selon sa part de points : 75 % et plus, bon ; 50 % et plus, possible ; moins, déconseillé ; avec moins de trois critères connus, pas de verdict. Une houle principale qui vaut 0 point (sous 0,5 m, ou 4 m et plus) rend le verdict « déconseillé », quelles que soient les autres notes'
	],
	kite: [
		'wind within the range asked for (default 12 to 25 knots): good; within 3 knots of it: possible; else poor. Gusts above the mean wind by 5 knots or less: good; 6 to 8: possible; more: poor. Wind from the land side (offshore): possible at best',
		'vent dans la plage voulue (par défaut 12 à 25 nœuds) : bon ; à moins de 3 nœuds de cette plage : possible ; sinon déconseillé. Rafales au-dessus du vent moyen de 5 nœuds ou moins : bon ; de 6 à 8 : possible ; plus : déconseillé. Vent venant de la terre : possible au mieux'
	],
	boat: [
		'mean wind in Beaufort force (knots rounded): 4 or less good, 5 possible, 6 and over poor. Gusts: force 5 or less good, 6 to 7 possible, 8 and over poor. Sea (significant wave height): under 1.25 m good, under 2.5 m possible, else poor',
		'vent moyen en force Beaufort (nœuds arrondis) : 4 ou moins, bon ; 5, possible ; 6 et plus, déconseillé. Rafales : force 5 ou moins, bon ; 6 à 7, possible ; 8 et plus, déconseillé. Mer (hauteur significative des vagues) : sous 1,25 m, bon ; sous 2,5 m, possible ; sinon déconseillé'
	],
	shore_fishing: [
		"only in the 2 hours before a low water, judged at the middle of the hour; outside, poor. Coefficient estimated by Vigie (not SHOM's) of the Brest high water nearest in time to that low water: 70 to 99 good, 50 to 69 possible, 100 and over possible (the SNSM says 100 and over is a danger), under 50 poor. Wind force 5 or less good, 6 possible, 7 and over poor. Sea under 1.25 m good, under 2.5 m possible, else poor. Without the low water, null",
		'seulement dans les 2 heures avant une basse mer, jugé au milieu de l’heure ; en dehors, déconseillé. Coefficient estimé par Vigie (pas celui du SHOM) de la pleine mer de Brest la plus proche dans le temps de cette basse mer : de 70 à 99, bon ; de 50 à 69, possible ; 100 et plus, possible (la SNSM dit que 100 et plus est un danger) ; sous 50, déconseillé. Vent de force 5 ou moins, bon ; 6, possible ; 7 et plus, déconseillé. Mer sous 1,25 m, bon ; sous 2,5 m, possible ; sinon déconseillé. Sans la basse mer, pas de verdict'
	],
	vigilance: [
		'an official coastal warning (phenomenon coastal; in France the wave-submersion vigilance) in force at the spot: red makes every verdict poor; orange keeps the boat and the shore fishing at possible at best; yellow changes nothing. Where the warnings could not be read, nothing is capped and vigilance.status says unknown',
		'une vigilance côtière officielle (phénomène côtier ; en France la vigilance vagues-submersion) en vigueur sur le spot : rouge, tout est déconseillé ; orange, le bateau et la pêche à pied sont « possible » au mieux ; jaune, rien ne change. Quand les vigilances n’ont pas pu être lues, rien n’est plafonné et le statut de la vigilance dit « inconnu »'
	]
};

/** The rules to show, in the order of the page, in the reader's language: the API's words, or their French when translated. */
export function ruleLines(lang: Lang, rules: ActivitiesForecast['rules']): { key: string; text: string }[] {
	return ['verdict', 'headline', 'surf', 'kite', 'boat', 'shore_fishing', 'vigilance'].flatMap((key) => {
		const api = rules[key];
		if (!api) return [];
		const fr = RULES_FR[key];
		return [{ key, text: lang === 'fr' && fr && api === fr[0] ? fr[1] : api }];
	});
}
