// "My spot in one sentence": what matters at a place, told in a few short sentences built from the data the
// page already has. The sentence is the site's own (the page says so); a warning keeps the issuer's word when
// the issuer wrote one in the reader's language, else the site's label of its phenomenon. Pure functions.
import { number } from './format';
import { t, tOr, type Key, type Lang } from './i18n';
import { rank } from './levels';
import type { Profile } from './profiles';
import type { Hazard, PointWeather, WarningSummary } from './types';
import { skyLabel } from './weather';

/**
 * Where the official warnings of the place stand. `unplaced`: none holds the place, but the country has warnings
 * without an area, so "nothing here" cannot be said.
 */
export type OfficialState = 'loading' | 'failed' | 'nosource' | 'none' | 'unplaced' | 'warnings';

export interface SentenceInput {
	lang: Lang;
	profile: Profile | null;
	official: OfficialState;
	/** The warnings in force at the place. */
	warnings: WarningSummary[];
	hazards: { hazard: Hazard; distanceKm: number }[];
	weather: PointWeather | null;
	/** Now, in seconds. */
	now: number;
	/** The reader's time zone (the browser's when not given). */
	timeZone?: string;
}

const FROM: Record<Lang, string[]> = {
	fr: ['du nord', 'de nord-est', "d'est", 'de sud-est', 'du sud', 'de sud-ouest', "d'ouest", 'de nord-ouest'],
	en: [
		'from the north',
		'from the north-east',
		'from the east',
		'from the south-east',
		'from the south',
		'from the south-west',
		'from the west',
		'from the north-west'
	]
};

/** Where a wind or a wave comes from, in words; null when unknown. */
export function fromDirection(lang: Lang, degrees: number | null): string | null {
	if (degrees == null) return null;
	return FROM[lang][Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/** The label of a warning in the reader's language: the issuer's word when it wrote one, else the site's. */
export function warningLabel(warning: WarningSummary, lang: Lang): string | null {
	const own = warning.texts.find((x) => x.language.toLowerCase().startsWith(lang))?.event;
	if (own) return own;
	if (!warning.phenomenon) return null;
	return tOr(lang, `phen.${warning.phenomenon}`, warning.phenomenon).toLowerCase();
}

function clock(lang: Lang, unix: number, timeZone?: string): string {
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

function dayKey(unix: number, timeZone?: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone
	}).format(new Date(unix * 1000));
}

/** "jusqu'à 23 h", "jusqu'à demain 8 h", "jusqu'au ven. 30 oct., 7 h". */
export function untilPhrase(lang: Lang, unix: number, now: number, timeZone?: string): string {
	const time = clock(lang, unix, timeZone);
	const day = dayKey(unix, timeZone);
	if (day === dayKey(now, timeZone)) return t(lang, 'sentence.untilToday', { time });
	if (day === dayKey(now + 86_400, timeZone)) return t(lang, 'sentence.untilTomorrow', { time });
	const date = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone
	}).format(new Date(unix * 1000));
	return t(lang, 'sentence.untilDate', { date, time });
}

function officialPart(input: SentenceInput): string | null {
	const { lang, official, warnings, now, timeZone } = input;
	if (official === 'nosource') return t(lang, 'sentence.noSource');
	if (official === 'none') return t(lang, 'sentence.none');
	if (official !== 'warnings' || warnings.length === 0) return null;
	const top = Math.max(...warnings.map((w) => rank(w.level)));
	const highest = warnings.filter((w) => rank(w.level) === top);
	const labels = [...new Set(highest.map((w) => warningLabel(w, lang)).filter((l): l is string => !!l))];
	const what =
		labels.length > 3 ? `${labels.slice(0, 3).join(', ')} (+${labels.length - 3})` : labels.join(', ');
	const level = highest[0].level;
	const levelWord = level ? t(lang, `level.${level}` as Key) : t(lang, 'level.none');
	const ends = highest.map((w) => w.ends ?? w.expires).filter((v): v is number => v != null && v > now);
	const until = ends.length ? untilPhrase(lang, Math.max(...ends), now, timeZone) : null;
	// When the issuer's own words already name the level ("Vigilance rouge pluie-inondation"), they are said
	// alone, not after the site's "Vigilance rouge :".
	if (level && labels.length && labels.every((l) => l.toLowerCase().includes(levelWord.toLowerCase())))
		return until ? `${what}, ${until}.` : `${what}.`;
	const params = {
		level: lang === 'fr' ? levelWord.toLowerCase() : levelWord,
		what: what || '–'
	};
	if (!until) return t(lang, 'sentence.warning', params);
	return t(lang, 'sentence.warningUntil', { ...params, until });
}

function hazardPart(input: SentenceInput): string | null {
	const { lang, hazards } = input;
	if (!hazards.length) return null;
	const first = [...hazards].sort(
		(a, b) => rank(b.hazard.level) - rank(a.hazard.level) || a.distanceKm - b.distanceKm
	)[0];
	const h = first.hazard;
	const kind = tOr(lang, `cat1.${h.category}`, h.category);
	const what = h.category === 'EARTHQUAKE' && h.value != null ? `${kind} M ${number(lang, h.value)}` : kind;
	return t(lang, 'sentence.hazard', { what, km: number(lang, first.distanceKm, 0) });
}

function seaPart(input: SentenceInput): string | null {
	const { lang } = input;
	const sea = input.weather?.marine;
	if (!sea || sea.waveM == null) return null;
	const parts = [`${number(lang, sea.waveM)} m`];
	if (sea.wavePeriodS != null) parts.push(`${number(lang, sea.wavePeriodS, 0)} s`);
	const from = fromDirection(lang, sea.waveDeg);
	if (from) parts.push(from);
	return t(lang, 'sentence.waves', { v: parts.join(', ') });
}

function windPart(input: SentenceInput): string | null {
	const { lang } = input;
	const now = input.weather?.current;
	if (!now || now.windKmh == null) return null;
	const v = `${number(lang, now.windKmh, 0)} km/h`;
	const from = fromDirection(lang, now.windDeg);
	return from ? t(lang, 'sentence.wind', { v, from }) : t(lang, 'sentence.windNoDir', { v });
}

function weatherPart(input: SentenceInput): string | null {
	const { lang } = input;
	const now = input.weather?.current;
	if (!now) return null;
	const temp = now.tempC != null ? `${number(lang, now.tempC, 0)} °C` : null;
	const sky = now.code != null ? skyLabel(lang, now.code) : null;
	if (!temp && !sky) return null;
	return `${[sky, temp].filter(Boolean).join(', ')}.`;
}

function spacePart(input: SentenceInput): string | null {
	const { lang } = input;
	const space = input.weather?.space;
	if (!space || space.kp == null) return null;
	return t(lang, 'sentence.space', {
		kp: number(lang, space.kp),
		storm: space.storm ? ` (${space.storm})` : ''
	});
}

function airPart(input: SentenceInput): string | null {
	const { lang } = input;
	const air = input.weather?.air;
	if (!air || air.eaqi == null) return null;
	return t(lang, 'sentence.air', { v: number(lang, air.eaqi, 0) });
}

/** The sentences that sum up a place, the most important first; none while nothing is known yet. */
export function placeSentence(input: SentenceInput): string[] {
	const { profile } = input;
	const parts = [officialPart(input), hazardPart(input)];
	if (input.weather?.marine) parts.push(seaPart(input));
	if (profile === 'sky') parts.push(spacePart(input));
	if (profile === 'allergy') parts.push(airPart(input));
	parts.push(weatherPart(input));
	if (profile === 'surf' || profile === 'sea') parts.push(windPart(input));
	return parts.filter((p): p is string => !!p);
}
