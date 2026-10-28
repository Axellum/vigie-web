// The sky: the aurora of the Vigie API (`/v1/sky/aurora`, `/v1/sky/aurora.geojson`). Pure functions: no network, no clock.
// Two kinds of values, never mixed: what NOAA SWPC publishes, shown as it is, and the API's own estimate for a place
// (its ADR 0013), always said to be an estimate. A value the API did not give stays null.
import type { FeatureCollection } from 'geojson';
import type { Lang } from './i18n';

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type AuroraLevel = 'likely' | 'possible' | 'unlikely' | 'very_unlikely';
const LEVELS: AuroraLevel[] = ['likely', 'possible', 'unlikely', 'very_unlikely'];
const asLevel = (v: unknown): AuroraLevel | null =>
	LEVELS.includes(v as AuroraLevel) ? (v as AuroraLevel) : null;

export interface KpPeriod {
	start: number;
	end: number;
	kp: number;
	kind: 'observed' | 'estimated' | 'predicted';
	scale: string | null;
}

export interface AuroraHour {
	time: number;
	kp: number | null;
	distanceToEdgeKm: number | null;
	activity: number | null;
	darkness: number;
	moon: number;
	moonAltitude: number;
	moonIlluminated: number;
	cloudCover: number | null;
	clouds: number | null;
	chanceClearSky: number | null;
	chance: number | null;
}

export interface AuroraEstimate {
	nightStart: number | null;
	nightEnd: number | null;
	hours: AuroraHour[];
	best: { start: number; end: number; chance: number; level: AuroraLevel; withClouds: boolean } | null;
	level: AuroraLevel | null;
	cloudsKnown: boolean;
	method: string | null;
}

export interface AuroraPlace {
	lat: number;
	lon: number;
	magneticLat: number | null;
	utcOffsetS: number | null;
	ovation: { forecast: number; here: number; strongest: number | null; strongestKm: number | null } | null;
	estimate: AuroraEstimate | null;
	noEstimateReason: string | null;
}

export interface Aurora {
	generated: number;
	oval: { observation: number; forecast: number; max: number } | null;
	kp: KpPeriod[];
	kpNow: KpPeriod | null;
	kpMax24h: KpPeriod | null;
	wind: {
		measured: number;
		speed: number | null;
		density: number | null;
		bz: number | null;
		bt: number | null;
	} | null;
	messages: { id: string; issued: number; headline: string | null; message: string }[];
	place: AuroraPlace | null;
	unavailable: string[];
	attribution: string | null;
}

function kpPeriod(v: unknown): KpPeriod | null {
	const o = obj(v);
	const start = num(o.start_utc),
		end = num(o.end_utc),
		kp = num(o.kp);
	const kind = o.kind === 'observed' || o.kind === 'estimated' || o.kind === 'predicted' ? o.kind : null;
	if (start == null || end == null || kp == null || kind == null) return null;
	return { start, end, kp, kind, scale: str(o.noaa_scale) };
}

function estimateFrom(v: unknown): AuroraEstimate | null {
	if (v == null) return null;
	const o = obj(v);
	const hours: AuroraHour[] = [];
	for (const item of arr(o.hours)) {
		const h = obj(item);
		const time = num(h.time_utc),
			darkness = num(h.darkness),
			moon = num(h.moon);
		if (time == null || darkness == null || moon == null) continue;
		hours.push({
			time,
			kp: num(h.kp),
			distanceToEdgeKm: num(h.distance_to_edge_km),
			activity: num(h.activity),
			darkness,
			moon,
			moonAltitude: num(h.moon_altitude_deg) ?? 0,
			moonIlluminated: num(h.moon_illuminated) ?? 0,
			cloudCover: num(h.cloud_cover_pct),
			clouds: num(h.clouds),
			chanceClearSky: num(h.chance_clear_sky),
			chance: num(h.chance)
		});
	}
	const b = o.best == null ? null : obj(o.best);
	const bestLevel = b ? asLevel(b.level) : null;
	const best =
		b && bestLevel && num(b.start_utc) != null && num(b.end_utc) != null && num(b.chance) != null
			? {
					start: num(b.start_utc) as number,
					end: num(b.end_utc) as number,
					chance: num(b.chance) as number,
					level: bestLevel,
					withClouds: b.with_clouds === true
				}
			: null;
	return {
		nightStart: num(o.night_start_utc),
		nightEnd: num(o.night_end_utc),
		hours,
		best,
		level: asLevel(o.level),
		cloudsKnown: o.clouds_known === true,
		method: str(o.method)
	};
}

/** The answer of `/v1/sky/aurora`. */
export function auroraFromApi(body: unknown): Aurora {
	const o = obj(body);
	const oval = o.oval == null ? null : obj(o.oval);
	const wind = o.solar_wind == null ? null : obj(o.solar_wind);
	const p = o.place == null ? null : obj(o.place);
	const ov = p && p.ovation != null ? obj(p.ovation) : null;
	return {
		generated: num(o.generated_utc) ?? 0,
		oval:
			oval && num(oval.observation_utc) != null && num(oval.forecast_utc) != null
				? {
						observation: num(oval.observation_utc) as number,
						forecast: num(oval.forecast_utc) as number,
						max: num(oval.max_value) ?? 0
					}
				: null,
		kp: arr(o.kp)
			.map(kpPeriod)
			.filter((k): k is KpPeriod => k !== null),
		kpNow: kpPeriod(o.kp_now),
		kpMax24h: kpPeriod(o.kp_max_next_24h),
		wind:
			wind && num(wind.measured_utc) != null
				? {
						measured: num(wind.measured_utc) as number,
						speed: num(wind.speed_km_s),
						density: num(wind.density_cm3),
						bz: num(wind.bz_nt),
						bt: num(wind.bt_nt)
					}
				: null,
		messages: arr(o.messages).flatMap((m) => {
			const x = obj(m);
			const issued = num(x.issued_utc),
				message = str(x.message);
			if (issued == null || message == null) return [];
			return [
				{
					id: `${str(x.product_id) ?? ''}:${str(x.serial) ?? issued}`,
					issued,
					headline: str(x.headline),
					message
				}
			];
		}),
		place:
			p && num(p.lat) != null && num(p.lon) != null
				? {
						lat: num(p.lat) as number,
						lon: num(p.lon) as number,
						magneticLat: num(p.magnetic_lat),
						utcOffsetS: num(p.utc_offset_s),
						ovation:
							ov && num(ov.forecast_utc) != null && num(ov.value_here) != null
								? {
										forecast: num(ov.forecast_utc) as number,
										here: num(ov.value_here) as number,
										strongest: num(ov.strongest_within_1000_km),
										strongestKm: num(ov.strongest_distance_km)
									}
								: null,
						estimate: estimateFrom(p.estimate),
						noEstimateReason: str(p.no_estimate_reason)
					}
				: null,
		unavailable: arr(o.unavailable).filter((s): s is string => typeof s === 'string'),
		attribution: str(o.attribution)
	};
}

/** The answer of `/v1/sky/aurora.geojson`, as the map draws it. */
export function ovalFromApi(body: unknown): {
	features: FeatureCollection;
	forecast: number | null;
	attribution: string | null;
} {
	const o = obj(body);
	const features = arr(o.features).filter((f) => {
		const x = obj(f);
		return x.type === 'Feature' && obj(x.geometry).type != null && num(obj(x.properties).min) != null;
	}) as FeatureCollection['features'];
	return {
		features: { type: 'FeatureCollection', features },
		forecast: num(o.forecast_utc),
		attribution: str(o.attribution)
	};
}

// ---------------------------------------------------------------------------------------------------------------------
// Words (the site's own, French and English). The texts of SWPC's messages are never here: they are shown as written.
// ---------------------------------------------------------------------------------------------------------------------

const TEXT = {
	fr: {
		title: 'Ciel',
		auroraTitle: 'Aurores',
		tonight: "Ce soir d'ici",
		estimate: 'Estimation Vigie',
		estimateNote:
			"Calculée par Vigie à partir du Kp prévu par la NOAA, de la latitude magnétique, de la nuit, de la Lune et des nuages prévus : ce n'est pas une prévision officielle. Méthode et mesure sur des nuits passées :",
		method: 'la méthode',
		'level.likely': 'Aurore probable',
		'level.possible': 'Aurore possible',
		'level.unlikely': 'Aurore peu probable',
		'level.very_unlikely': 'Aurore très peu probable',
		window: 'surtout entre {from} et {to}',
		clearSky: 'si le ciel est dégagé',
		overhead: 'parfois haut dans le ciel',
		lowHorizon: 'basse sur l’horizon {dir}',
		north: 'nord',
		south: 'sud',
		'why.clouds': 'le ciel sera trop couvert',
		'why.activity': "l'activité magnétique est trop faible pour cette latitude",
		'why.moon': 'la Lune éclaire le ciel',
		'why.dark': 'les nuits sont trop claires en ce moment à cette latitude',
		noKp: "L'indice de la NOAA n'a pas pu être lu : pas d'estimation.",
		noNight: 'Pas de nuit assez noire ici dans les 36 prochaines heures : pas d’aurore visible.',
		'activity.calm': 'Activité magnétique calme',
		'activity.unsettled': 'Activité magnétique agitée',
		'activity.storm': 'Orage magnétique {scale}',
		activityNext: 'dans les 24 prochaines heures',
		details: 'Détail heure par heure',
		hour: 'Heure',
		chance: 'Chance',
		clouds: 'Nuages',
		moon: 'Lune',
		kp: 'Indice Kp',
		night: 'Nuit',
		unknown: 'inconnu',
		ovationNow: 'Ovale de la NOAA (prochaine heure)',
		ovationNear: 'aurore à {km} km d’ici (intensité {v} sur 100 selon la NOAA)',
		ovationHere: 'aurore au-dessus de vous (intensité {v} sur 100 selon la NOAA)',
		ovationNone: 'aucune aurore à moins de 1 000 km',
		wind: 'Vent solaire',
		windValue: '{speed} km/s, Bz {bz} nT',
		messages: 'Messages géomagnétiques de la NOAA (texte original, en anglais)',
		layer: 'Ovale des aurores (NOAA, 30 à 90 min)',
		layerNote:
			'Prévision OVATION de la NOAA pour {time}. Teintes : intensité de l’aurore (seuils choisis par Vigie).',
		kpChart: 'Indice Kp, observé puis prévu (NOAA)',
		'kind.observed': 'observé',
		'kind.estimated': 'estimé',
		'kind.predicted': 'prévu',
		unavailable: 'Données de la NOAA indisponibles pour le moment.',
		loading: 'Chargement…',
		pageLink: 'Carte des aurores et activité des prochains jours',
		pickPlace: 'Choisissez un lieu pour savoir si une aurore est visible ce soir.',
		myPosition: 'Ma position',
		positionDenied: 'Position refusée par le navigateur : cherchez un lieu par son nom.',
		kpLegend: 'Barres pleines : observé ou estimé par la NOAA. Barres pâles : prévu.',
		page: 'Le ciel : aurores',
		pageIntro:
			"Où se trouvent les aurores en ce moment, et la chance d'en voir une ce soir depuis un lieu. Données de la NOAA (domaine public), estimation de Vigie."
	},
	en: {
		title: 'Sky',
		auroraTitle: 'Aurora',
		tonight: 'Tonight from here',
		estimate: 'Vigie estimate',
		estimateNote:
			"Computed by Vigie from NOAA's forecast Kp, the magnetic latitude, the darkness, the Moon and the forecast clouds: not an official forecast. Method and measure on past nights:",
		method: 'the method',
		'level.likely': 'Aurora likely',
		'level.possible': 'Aurora possible',
		'level.unlikely': 'Aurora unlikely',
		'level.very_unlikely': 'Aurora very unlikely',
		window: 'best between {from} and {to}',
		clearSky: 'if the sky is clear',
		overhead: 'at times high in the sky',
		lowHorizon: 'low on the {dir} horizon',
		north: 'northern',
		south: 'southern',
		'why.clouds': 'the sky will be too cloudy',
		'why.activity': 'the magnetic activity is too weak for this latitude',
		'why.moon': 'the Moon lights the sky',
		'why.dark': 'the nights are too bright at this latitude now',
		noKp: "NOAA's index could not be read: no estimate.",
		noNight: 'No night dark enough here in the next 36 hours: no visible aurora.',
		'activity.calm': 'Quiet magnetic activity',
		'activity.unsettled': 'Unsettled magnetic activity',
		'activity.storm': 'Geomagnetic storm {scale}',
		activityNext: 'over the next 24 hours',
		details: 'Hour by hour',
		hour: 'Hour',
		chance: 'Chance',
		clouds: 'Clouds',
		moon: 'Moon',
		kp: 'Kp index',
		night: 'Night',
		unknown: 'unknown',
		ovationNow: "NOAA's oval (next hour)",
		ovationNear: 'aurora {km} km from here (intensity {v} out of 100, NOAA)',
		ovationHere: 'aurora overhead (intensity {v} out of 100, NOAA)',
		ovationNone: 'no aurora within 1,000 km',
		wind: 'Solar wind',
		windValue: '{speed} km/s, Bz {bz} nT',
		messages: "NOAA's geomagnetic messages (original text)",
		layer: 'Aurora oval (NOAA, 30 to 90 min)',
		layerNote: "NOAA's OVATION forecast for {time}. Shades: aurora intensity (levels chosen by Vigie).",
		kpChart: 'Kp index, observed then forecast (NOAA)',
		'kind.observed': 'observed',
		'kind.estimated': 'estimated',
		'kind.predicted': 'forecast',
		unavailable: "NOAA's data is unavailable for now.",
		loading: 'Loading…',
		pageLink: 'Aurora map and the coming days',
		pickPlace: 'Choose a place to know whether an aurora may be seen tonight.',
		myPosition: 'My position',
		positionDenied: 'The browser refused the position: search a place by its name.',
		kpLegend: 'Solid bars: observed or estimated by NOAA. Pale bars: forecast.',
		page: 'The sky: aurora',
		pageIntro:
			'Where the aurora is right now, and the chance to see one tonight from a place. Data from NOAA (public domain), estimate by Vigie.'
	}
} as const;

export type SkyKey = keyof (typeof TEXT)['fr'];

export function sky(lang: Lang, key: SkyKey, params: Record<string, string | number> = {}): string {
	let text: string = TEXT[lang][key] ?? TEXT.fr[key];
	for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}

/** The two dictionaries have the same keys (for the test). */
export const SKY_KEYS = { fr: Object.keys(TEXT.fr), en: Object.keys(TEXT.en) };

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

/** An hour at the place: in its own offset when the API gave one, else in the reader's time zone. */
export function placeTime(lang: Lang, unix: number, utcOffsetS: number | null): string {
	if (utcOffsetS == null) {
		return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(
			new Date(unix * 1000)
		);
	}
	return new Intl.DateTimeFormat(LOCALE[lang], {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC'
	}).format(new Date((unix + utcOffsetS) * 1000));
}

/** The magnetic activity in words, from the highest Kp of the next 24 hours (NOAA's G scale from Kp 5). */
export function activityWords(lang: Lang, period: KpPeriod | null): string | null {
	if (!period) return null;
	if (period.kp >= 5)
		return sky(lang, 'activity.storm', {
			scale: period.scale ?? `G${Math.min(5, Math.floor(period.kp) - 4)}`
		});
	if (period.kp >= 4) return sky(lang, 'activity.unsettled');
	return sky(lang, 'activity.calm');
}

/** What limits the best hour most when the chance is low: the clouds, the activity, the Moon, or the darkness. */
function limit(hours: AuroraHour[]): 'clouds' | 'activity' | 'moon' | 'dark' {
	const clear = hours.filter((h) => h.chanceClearSky != null);
	if (!clear.length) return 'activity';
	const best = clear.reduce((a, b) => ((b.chanceClearSky ?? 0) > (a.chanceClearSky ?? 0) ? b : a));
	if ((best.chanceClearSky ?? 0) >= 0.2 && best.clouds != null && (best.chance ?? 0) < 0.2) return 'clouds';
	if ((best.activity ?? 0) < 0.2) return 'activity';
	if (best.moon < 0.8 && (best.activity ?? 0) * best.darkness >= 0.2) return 'moon';
	return best.darkness < 0.5 ? 'dark' : 'activity';
}

/**
 * The sentence of the "Sky" card: the level of the night, its best hours at the place, where to look; and, when the
 * chance is low, why. Built only from the API's answer.
 */
export function auroraSentence(lang: Lang, place: AuroraPlace): string {
	const e = place.estimate;
	if (!e) return place.noEstimateReason?.startsWith('SWPC') ? sky(lang, 'noKp') : sky(lang, 'noNight');
	const level = e.level ?? 'very_unlikely';
	const parts: string[] = [sky(lang, `level.${level}`)];
	if (e.best && (level === 'likely' || level === 'possible')) {
		parts.push(
			sky(lang, 'window', {
				from: placeTime(lang, e.best.start, place.utcOffsetS),
				to: placeTime(lang, e.best.end, place.utcOffsetS)
			})
		);
		const bestHour = e.hours.find((h) => h.time === e.best?.start);
		const under = bestHour?.distanceToEdgeKm != null && bestHour.distanceToEdgeKm <= 0;
		const dir = (place.magneticLat ?? place.lat) >= 0 ? sky(lang, 'north') : sky(lang, 'south');
		parts.push(under ? sky(lang, 'overhead') : sky(lang, 'lowHorizon', { dir }));
		if (!e.best.withClouds) parts.push(sky(lang, 'clearSky'));
		return `${parts.join(', ')}.`;
	}
	if (level === 'unlikely' || level === 'very_unlikely') {
		const why = limit(e.hours);
		return `${parts[0]} : ${sky(lang, `why.${why}`)}.`.replace(' : ', lang === 'fr' ? ' : ' : ': ');
	}
	return `${parts[0]}.`;
}
