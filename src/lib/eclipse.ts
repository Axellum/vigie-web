// Solar eclipses of the Vigie API (`/v1/sky/eclipses`, `/v1/sky/eclipses/{date}`, `/v1/sky/eclipses/{date}.geojson`).
// Pure functions: no network, no clock. Two kinds of values, never mixed: NASA's catalogue as NASA states it, and
// what the API works out for a place from NASA's elements (the contacts, the share of the Sun hidden, the disc). A
// value the API did not give stays null.
import type { FeatureCollection } from 'geojson';
import type { Lang } from './i18n';

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type EclipseKind = 'total' | 'annular' | 'hybrid' | 'partial';
export type LocalKind = 'total' | 'annular' | 'partial' | 'none';
export type ContactName = 'partial_begin' | 'central_begin' | 'maximum' | 'central_end' | 'partial_end';
const KINDS: EclipseKind[] = ['total', 'annular', 'hybrid', 'partial'];
const LOCAL_KINDS: LocalKind[] = ['total', 'annular', 'partial', 'none'];
const CONTACTS: ContactName[] = ['partial_begin', 'central_begin', 'maximum', 'central_end', 'partial_end'];

/** An eclipse's date (its identifier), as the API writes it. */
export const ECLIPSE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface EclipseContact {
	name: ContactName;
	time: number;
	sunAltitude: number;
	sunUp: boolean;
}

/** The Moon on the Sun's disc, in units of the Sun's radius (north up, east to the left as seen in the sky). */
export interface EclipseFrame {
	time: number;
	east: number;
	north: number;
	moonRadius: number;
	obscuration: number;
	sunAltitude: number;
}

export interface EclipseHere {
	lat: number;
	lon: number;
	kind: LocalKind;
	visible: boolean;
	magnitude: number | null;
	obscuration: number | null;
	centralDuration: number | null;
	contacts: EclipseContact[];
	sunrise: number | null;
	sunset: number | null;
	frames: EclipseFrame[] | null;
	clouds: { time: number; cover: number | null; attribution: string | null } | null;
	cloudsNote: string | null;
}

export interface Eclipse {
	id: string;
	kind: EclipseKind;
	greatest: number;
	greatestLat: number | null;
	greatestLon: number | null;
	magnitude: number | null;
	pathWidthKm: number | null;
	centralDuration: number | null;
	here: EclipseHere | null;
	attribution: string | null;
}

export interface EclipseList {
	eclipses: Eclipse[];
	attribution: string | null;
}

function contactFrom(v: unknown): EclipseContact | null {
	const o = obj(v);
	const name = CONTACTS.includes(o.name as ContactName) ? (o.name as ContactName) : null;
	const time = num(o.time_utc),
		sunAltitude = num(o.sun_altitude_deg);
	if (!name || time == null || sunAltitude == null) return null;
	return { name, time, sunAltitude, sunUp: o.sun_up === true };
}

function frameFrom(v: unknown): EclipseFrame | null {
	const o = obj(v);
	const time = num(o.time_utc),
		east = num(o.moon_east),
		north = num(o.moon_north),
		moonRadius = num(o.moon_radius),
		obscuration = num(o.obscuration),
		sunAltitude = num(o.sun_altitude_deg);
	if (time == null || east == null || north == null || moonRadius == null || obscuration == null) return null;
	return { time, east, north, moonRadius, obscuration, sunAltitude: sunAltitude ?? 0 };
}

function hereFrom(v: unknown): EclipseHere | null {
	const o = obj(v);
	const lat = num(o.lat),
		lon = num(o.lon);
	const kind = LOCAL_KINDS.includes(o.kind as LocalKind) ? (o.kind as LocalKind) : null;
	if (lat == null || lon == null || !kind) return null;
	const clouds = obj(o.clouds);
	const cloudTime = num(clouds.time_utc);
	return {
		lat,
		lon,
		kind,
		visible: o.visible === true,
		magnitude: num(o.magnitude),
		obscuration: num(o.obscuration),
		centralDuration: num(o.central_duration_s),
		contacts: arr(o.contacts)
			.map(contactFrom)
			.filter((c): c is EclipseContact => c !== null),
		sunrise: num(o.sunrise_utc),
		sunset: num(o.sunset_utc),
		frames: Array.isArray(o.frames)
			? o.frames.map(frameFrom).filter((f): f is EclipseFrame => f !== null)
			: null,
		clouds:
			cloudTime == null
				? null
				: { time: cloudTime, cover: num(clouds.cloud_cover_pct), attribution: str(clouds.attribution) },
		cloudsNote: str(o.clouds_note)
	};
}

/** One eclipse of the API (from the list or the detail route); null when its essential values are missing. */
export function eclipseFromApi(body: unknown): Eclipse | null {
	const o = obj(body);
	const id = str(o.id);
	const kind = KINDS.includes(o.kind as EclipseKind) ? (o.kind as EclipseKind) : null;
	const greatest = num(o.greatest_utc);
	if (!id || !ECLIPSE_DATE.test(id) || !kind || greatest == null) return null;
	return {
		id,
		kind,
		greatest,
		greatestLat: num(o.greatest_lat),
		greatestLon: num(o.greatest_lon),
		magnitude: num(o.magnitude),
		pathWidthKm: num(o.path_width_km),
		centralDuration: num(o.central_duration_s),
		here: o.here == null ? null : hereFrom(o.here),
		attribution: str(o.attribution)
	};
}

export function eclipseListFromApi(body: unknown): EclipseList {
	const o = obj(body);
	return {
		eclipses: arr(o.eclipses)
			.map(eclipseFromApi)
			.filter((e): e is Eclipse => e !== null),
		attribution: str(o.attribution)
	};
}

/** The map of one eclipse (bands, path, central line), as the API draws it. */
export function eclipseMapFromApi(body: unknown): {
	id: string | null;
	features: FeatureCollection;
	attribution: string | null;
} {
	const o = obj(body);
	return {
		id: str(o.id),
		features: {
			type: 'FeatureCollection',
			features: arr(o.features).filter(
				(f) => obj(f).type === 'Feature' && obj(obj(f).geometry).type
			) as FeatureCollection['features']
		},
		attribution: str(o.attribution)
	};
}

// --- words -------------------------------------------------------------------------------------------------

const TEXT = {
	fr: {
		page: 'Éclipses de Soleil',
		pageIntro: 'Les éclipses de Soleil à venir d’après la NASA, et ce que vous en verrez d’un lieu.',
		link: 'Éclipses de Soleil',
		list: 'Les prochaines éclipses',
		'kind.total': 'Éclipse totale',
		'kind.annular': 'Éclipse annulaire',
		'kind.hybrid': 'Éclipse hybride',
		'kind.partial': 'Éclipse partielle',
		'longest.total': 'jusqu’à {d} de totalité',
		'longest.annular': 'anneau jusqu’à {d}',
		'longest.hybrid': 'jusqu’à {d} de totalité ou d’anneau',
		chosen: 'Éclipse choisie',
		map: 'Carte de l’éclipse',
		mapNote:
			'Bande sombre : là où le Soleil sera entièrement caché (ou réduit à un anneau). Couleurs : part du Soleil cachée au plus fort, là où il est levé.',
		mapPick: 'Cliquez sur la carte pour choisir un lieu.',
		legend: 'Part du Soleil cachée',
		here: 'Depuis un lieu',
		pickPlace: 'Choisissez un lieu : recherche, position, ou clic sur la carte.',
		myPosition: 'Ma position',
		positionDenied: 'Position refusée par le navigateur.',
		loading: 'Calcul…',
		unavailable: 'Éclipses indisponibles pour le moment.',
		failed: 'Le calcul pour ce lieu n’a pas pu être obtenu.',
		'here.none': 'L’éclipse ne sera pas visible d’ici.',
		'here.total': 'Éclipse totale ici : le Soleil sera entièrement caché pendant {d}, à partir de {t}.',
		'here.annular':
			'Éclipse annulaire ici : il ne restera qu’un anneau de Soleil pendant {d}, à partir de {t}.',
		'here.partial': 'Éclipse partielle ici : la Lune cachera {pct} du Soleil, au plus fort à {t}.',
		'here.partialSetting': 'Éclipse partielle ici : la Lune cachera jusqu’à {pct} du Soleil.',
		'here.sunset': 'Le Soleil se couchera éclipsé, vers {t}.',
		'here.sunrise': 'Le Soleil se lèvera déjà éclipsé, vers {t}.',
		'here.lowSun':
			'Le Soleil sera bas, à {alt}° au-dessus de l’horizon au plus fort : il faut une vue dégagée.',
		'here.nearPath': 'La bande de totalité passe tout près : voyez la carte.',
		'contact.partial_begin': 'Début',
		'contact.central_begin.total': 'Début de la totalité',
		'contact.central_begin.annular': 'Début de l’anneau',
		'contact.maximum': 'Maximum',
		'contact.central_end.total': 'Fin de la totalité',
		'contact.central_end.annular': 'Fin de l’anneau',
		'contact.partial_end': 'Fin',
		sunAt: 'Soleil à {alt}°',
		sunDown: 'Soleil sous l’horizon',
		hidden: 'caché',
		timesNote: 'Heures de votre appareil ({tz}).',
		clouds: 'Nuages prévus à l’heure du maximum : {pct}.',
		cloudsUnknown: 'Nuages prévus à l’heure du maximum : inconnus.',
		cloudsLater: 'Les nuages prévus seront indiqués dans les 48 heures avant l’éclipse.',
		computed: 'Calculé par Vigie à partir des éléments de la NASA.',
		check: 'Comparaison avec les tables de la NASA',
		safety: 'Ne regardez jamais le Soleil sans lunettes spéciales éclipse, même presque entièrement caché.',
		disc: 'Le Soleil et la Lune vus d’ici',
		discNote: 'Nord en haut, est à gauche, comme dans le ciel.',
		play: 'Lecture',
		pause: 'Pause',
		at: 'Instant',
		duration: '{m} min {s} s',
		durationS: '{s} s'
	},
	en: {
		page: 'Solar eclipses',
		pageIntro: 'Upcoming solar eclipses from NASA, and what you will see of them from a place.',
		link: 'Solar eclipses',
		list: 'The next eclipses',
		'kind.total': 'Total eclipse',
		'kind.annular': 'Annular eclipse',
		'kind.hybrid': 'Hybrid eclipse',
		'kind.partial': 'Partial eclipse',
		'longest.total': 'up to {d} of totality',
		'longest.annular': 'a ring for up to {d}',
		'longest.hybrid': 'up to {d} of totality or ring',
		chosen: 'Chosen eclipse',
		map: 'Map of the eclipse',
		mapNote:
			'Dark band: where the Sun will be fully hidden (or reduced to a ring). Colours: the share of the Sun hidden at the peak, where it is up.',
		mapPick: 'Click the map to choose a place.',
		legend: 'Share of the Sun hidden',
		here: 'From a place',
		pickPlace: 'Choose a place: search, your position, or a click on the map.',
		myPosition: 'My position',
		positionDenied: 'Position refused by the browser.',
		loading: 'Working it out…',
		unavailable: 'Eclipses are unavailable for now.',
		failed: 'The eclipse at this place could not be worked out.',
		'here.none': 'The eclipse will not be visible from here.',
		'here.total': 'Total eclipse here: the Sun will be fully hidden for {d}, from {t}.',
		'here.annular': 'Annular eclipse here: only a ring of the Sun will be left for {d}, from {t}.',
		'here.partial': 'Partial eclipse here: the Moon will hide {pct} of the Sun, at its peak at {t}.',
		'here.partialSetting': 'Partial eclipse here: the Moon will hide up to {pct} of the Sun.',
		'here.sunset': 'The Sun will set eclipsed, around {t}.',
		'here.sunrise': 'The Sun will rise already eclipsed, around {t}.',
		'here.lowSun': 'The Sun will be low, {alt}° above the horizon at the peak: you need a clear view.',
		'here.nearPath': 'The path of totality passes close by: see the map.',
		'contact.partial_begin': 'Start',
		'contact.central_begin.total': 'Totality begins',
		'contact.central_begin.annular': 'Ring begins',
		'contact.maximum': 'Peak',
		'contact.central_end.total': 'Totality ends',
		'contact.central_end.annular': 'Ring ends',
		'contact.partial_end': 'End',
		sunAt: 'Sun at {alt}°',
		sunDown: 'Sun below the horizon',
		hidden: 'hidden',
		timesNote: 'Times of your device ({tz}).',
		clouds: 'Clouds forecast at the hour of the peak: {pct}.',
		cloudsUnknown: 'Clouds forecast at the hour of the peak: unknown.',
		cloudsLater: 'The forecast clouds will be shown in the 48 hours before the eclipse.',
		computed: 'Worked out by Vigie from NASA’s elements.',
		check: 'Comparison with NASA’s tables',
		safety: 'Never look at the Sun without eclipse glasses, even when it is almost fully hidden.',
		disc: 'The Sun and the Moon seen from here',
		discNote: 'North up, east to the left, as in the sky.',
		play: 'Play',
		pause: 'Pause',
		at: 'Time',
		duration: '{m} min {s} s',
		durationS: '{s} s'
	}
} as const;

export type EclipseKey = keyof (typeof TEXT)['fr'];

export function eclipseText(
	lang: Lang,
	key: EclipseKey,
	params: Record<string, string | number> = {}
): string {
	let text: string = TEXT[lang][key] ?? TEXT.fr[key];
	for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
	return text;
}

/** The two dictionaries have the same keys (for the test). */
export const ECLIPSE_KEYS = { fr: Object.keys(TEXT.fr), en: Object.keys(TEXT.en) };

const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };

/** A length of time in minutes and seconds ("4 min 48 s"). */
export function duration(lang: Lang, seconds: number): string {
	const whole = Math.round(seconds);
	const m = Math.floor(whole / 60),
		s = whole % 60;
	return m ? eclipseText(lang, 'duration', { m, s }) : eclipseText(lang, 'durationS', { s });
}

/** A time of day in the reader's time zone (or `timeZone`, for tests), with the seconds when asked. */
export function clock(lang: Lang, unix: number, seconds = false, timeZone?: string): string {
	return new Intl.DateTimeFormat(LOCALE[lang], {
		hour: '2-digit',
		minute: '2-digit',
		second: seconds ? '2-digit' : undefined,
		timeZone
	}).format(new Date(unix * 1000));
}

/** The date of an eclipse ("2 août 2027"), from its identifier. */
export function eclipseDate(lang: Lang, id: string): string {
	return new Intl.DateTimeFormat(LOCALE[lang], {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${id}T12:00:00Z`));
}

const percent = (lang: Lang, share: number) => `${Math.round(share * 100).toLocaleString(LOCALE[lang])} %`;

/** The name of a contact, for the kind of eclipse seen at the place. */
export function contactName(lang: Lang, name: ContactName, here: LocalKind): string {
	if (name === 'central_begin' || name === 'central_end')
		return eclipseText(lang, `contact.${name}.${here === 'annular' ? 'annular' : 'total'}`);
	return eclipseText(lang, `contact.${name}`);
}

/**
 * What a place sees, in plain sentences: the kind, how long or how much, when; then the Sun's height, a sunrise or
 * sunset during the eclipse, and the path when it passes close. Built only from the API's answer.
 */
export function eclipseSentences(lang: Lang, eclipse: Eclipse, timeZone?: string): string[] {
	const here = eclipse.here;
	if (!here || here.kind === 'none' || !here.visible) return [eclipseText(lang, 'here.none')];
	const at = (name: ContactName) => here.contacts.find((c) => c.name === name) ?? null;
	const peak = at('maximum');
	const begin = at('central_begin');
	const sentences: string[] = [];
	if ((here.kind === 'total' || here.kind === 'annular') && here.centralDuration != null && begin) {
		sentences.push(
			eclipseText(lang, `here.${here.kind}`, {
				d: duration(lang, here.centralDuration),
				t: clock(lang, begin.time, false, timeZone)
			})
		);
	} else if (peak?.sunUp && here.obscuration != null) {
		sentences.push(
			eclipseText(lang, 'here.partial', {
				pct: percent(lang, here.obscuration),
				t: clock(lang, peak.time, false, timeZone)
			})
		);
	} else if (here.obscuration != null) {
		sentences.push(eclipseText(lang, 'here.partialSetting', { pct: percent(lang, here.obscuration) }));
	}
	if (here.sunset != null)
		sentences.push(eclipseText(lang, 'here.sunset', { t: clock(lang, here.sunset, false, timeZone) }));
	if (here.sunrise != null)
		sentences.push(eclipseText(lang, 'here.sunrise', { t: clock(lang, here.sunrise, false, timeZone) }));
	if (peak?.sunUp && peak.sunAltitude < 15)
		sentences.push(eclipseText(lang, 'here.lowSun', { alt: Math.round(peak.sunAltitude) }));
	if (here.kind === 'partial' && eclipse.kind !== 'partial' && (here.obscuration ?? 0) >= 0.95)
		sentences.push(eclipseText(lang, 'here.nearPath'));
	return sentences;
}

/** The disc at `time`, between the two frames around it (the Moon moves almost in a straight line). */
export function frameAt(frames: EclipseFrame[], time: number): EclipseFrame | null {
	if (!frames.length) return null;
	if (time <= frames[0].time) return frames[0];
	const last = frames[frames.length - 1];
	if (time >= last.time) return last;
	const i = frames.findIndex((f) => f.time >= time);
	const a = frames[i - 1],
		b = frames[i];
	const k = (time - a.time) / (b.time - a.time || 1);
	const mix = (x: number, y: number) => x + (y - x) * k;
	return {
		time,
		east: mix(a.east, b.east),
		north: mix(a.north, b.north),
		moonRadius: mix(a.moonRadius, b.moonRadius),
		obscuration: overlap(
			Math.hypot(mix(a.east, b.east), mix(a.north, b.north)),
			mix(a.moonRadius, b.moonRadius)
		),
		sunAltitude: mix(a.sunAltitude, b.sunAltitude)
	};
}

/** The share of a disc of radius 1 hidden by a disc of radius `k` whose centre is `d` away. */
export function overlap(d: number, k: number): number {
	if (d >= 1 + k) return 0;
	if (d <= Math.abs(k - 1)) return k >= 1 ? 1 : k * k;
	const a1 = Math.acos(Math.max(-1, Math.min(1, (d * d + 1 - k * k) / (2 * d))));
	const a2 = Math.acos(Math.max(-1, Math.min(1, (d * d + k * k - 1) / (2 * d * k))));
	const lens =
		a1 + k * k * a2 - 0.5 * Math.sqrt(Math.max(0, (-d + 1 + k) * (d + 1 - k) * (d - 1 + k) * (d + 1 + k)));
	return lens / Math.PI;
}
