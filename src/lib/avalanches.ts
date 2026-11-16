// Official avalanche bulletins (`GET /v1/avalanches`: CAAML v6 of the SLF for Switzerland and Liechtenstein and of
// Avalanche.report for Tyrol, South Tyrol and Trentino; the BRA of Météo-France for the French massifs). The danger level
// is the European scale 1 to 5 as the service wrote it; the texts of the bulletin are the service's own, in the language
// it published (English for the first two, French for Météo-France).
import type { Lang } from './i18n';
import type { Level } from './types';

/** The countries the services cover in part: asked only there, the API says whether the point is inside a massif. */
export const AVALANCHE_COUNTRIES = new Set(['CH', 'LI', 'AT', 'IT', 'FR']);

/** The danger of one band of altitude ("2 below 2700 m, 3 above"). */
export interface AvalancheRating {
	level: number;
	lowerM: string | null;
	upperM: string | null;
}

export interface AvalancheProblem {
	type: string;
	level: number | null;
	lowerM: string | null;
	upperM: string | null;
	aspects: string[];
	comment: string | null;
}

export interface AvalancheBulletin {
	id: string;
	source: string;
	lang: string | null;
	validFrom: string | null;
	validUntil: string | null;
	maxLevel: number | null;
	ratings: AvalancheRating[];
	problems: AvalancheProblem[];
	/** The bulletin's own summary of the day ("Départs spontanés : …"), and its comment on the avalanche activity. */
	highlights: string | null;
	activity: string | null;
	snowpackTitle: string | null;
	snowpack: string | null;
	tendency: string | null;
	url: string | null;
}

export interface AvalanchesResponse {
	status: 'active' | 'confirmed_none' | 'outside_coverage' | 'unavailable';
	coveredBy: string | null;
	regionName: string | null;
	maxLevel: number | null;
	bulletins: AvalancheBulletin[];
	stale: boolean;
	attribution: string | null;
}

const STATUSES = new Set(['active', 'confirmed_none', 'outside_coverage', 'unavailable']);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const level = (v: unknown): number | null =>
	typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
const bound = (v: unknown): string | null => (typeof v === 'number' ? String(v) : str(v));

/** Parse `GET /v1/avalanches`; null only for a malformed answer. */
export function avalanchesFromApi(raw: unknown): AvalanchesResponse | null {
	const r = obj(raw);
	const status = str(r.status);
	if (!status || !STATUSES.has(status)) return null;
	const bulletins = list(r.bulletins).flatMap((item): AvalancheBulletin[] => {
		const b = obj(item);
		const id = str(b.bulletin_id);
		if (!id || b.is_expired === true) return [];
		// The outlook: its headline (the BRA's danger of the next day) then its comment, as one text.
		const tendency = list(b.tendency)
			.map((t) => [str(obj(t).highlights), str(obj(t).comment)].filter(Boolean).join(' — ') || null)
			.find((t) => t != null);
		return [
			{
				id,
				source: str(b.source) ?? '',
				lang: str(b.lang),
				validFrom: str(b.valid_from),
				validUntil: str(b.valid_until),
				maxLevel: level(b.max_danger_level),
				ratings: list(b.danger_ratings).flatMap((r): AvalancheRating[] => {
					const o = obj(r);
					const lvl = level(o.level);
					const e = obj(o.elevation);
					return lvl ? [{ level: lvl, lowerM: bound(e.lower_bound), upperM: bound(e.upper_bound) }] : [];
				}),
				highlights: str(b.avalanche_activity_highlights),
				activity: str(b.avalanche_activity_comment),
				snowpackTitle: str(b.snowpack_highlights),
				problems: list(b.avalanche_problems).flatMap((p): AvalancheProblem[] => {
					const o = obj(p);
					const type = str(o.problem_type);
					if (!type) return [];
					const e = obj(o.elevation);
					return [
						{
							type,
							level: level(o.danger_level),
							lowerM: bound(e.lower_bound),
							upperM: bound(e.upper_bound),
							aspects: list(o.aspects).flatMap((a) => (str(a) ? [str(a)!] : [])),
							comment: str(o.comment)
						}
					];
				}),
				snowpack: str(b.snowpack_comment),
				tendency: tendency ?? null,
				url: str(b.bulletin_url)
			}
		];
	});
	return {
		status: status as AvalanchesResponse['status'],
		coveredBy: str(r.covered_by),
		regionName: str(r.region_name),
		maxLevel: level(r.max_danger_level),
		bulletins,
		stale: r.stale === true,
		attribution: str(r.attribution)
	};
}

export function isCoveredAvalancheCountry(cc: string | null | undefined): boolean {
	return !!cc && AVALANCHE_COUNTRIES.has(cc.toUpperCase());
}

/** The colour of a danger level, on the colours the site already uses (the scale's own colours are the same order). */
export function avalancheTone(lvl: number | null): Level | null {
	if (lvl == null) return null;
	if (lvl <= 1) return 'GREEN';
	if (lvl === 2) return 'YELLOW';
	if (lvl === 3) return 'ORANGE';
	return 'RED';
}

/** The official page of the service that published, when the bulletin gave none. */
export function avalancheServiceUrl(source: string | null): string {
	if (source === 'euregio_avalanche') return 'https://avalanche.report/';
	if (source === 'meteofrance_bra') return 'https://meteofrance.com/meteo-montagne';
	return 'https://www.slf.ch/';
}

/** The bands of a bulletin worth a line: only when the danger changes with the altitude. */
export function ratingBands(b: AvalancheBulletin): AvalancheRating[] {
	const bands = b.ratings.filter((r) => r.lowerM || r.upperM);
	return bands.length > 1 && new Set(bands.map((r) => r.level)).size > 1 ? bands : [];
}

const TEXT = {
	fr: {
		title: 'Bulletin d’avalanches',
		'level.1': '1 · Faible',
		'level.2': '2 · Limité',
		'level.3': '3 · Marqué',
		'level.4': '4 · Fort',
		'level.5': '5 · Très fort',
		'problem.new_snow': 'Neige fraîche',
		'problem.wind_slab': 'Neige soufflée',
		'problem.persistent_weak_layers': 'Couches fragiles persistantes',
		'problem.wet_snow': 'Neige mouillée',
		'problem.gliding_snow': 'Avalanches de glissement',
		'problem.cornices': 'Corniches',
		'problem.favourable_situation': 'Situation favorable',
		'problem.no_distinct_avalanche_problem': 'Pas de problème avalancheux marqué',
		summary: 'Avalanches : danger {level}',
		summaryNone: 'Avalanches : pas de bulletin en cours (hors saison)',
		none: 'Aucun bulletin en cours pour ce secteur : hors saison, ou bulletin pas encore publié.',
		region: 'Secteur : {name}',
		valid: 'Valable jusqu’au {date}',
		above: 'au-dessus de {m}',
		below: 'au-dessous de {m}',
		between: 'de {low} à {high}',
		aspects: 'versants {list}',
		snowpack: 'Manteau neigeux',
		tendency: 'Tendance',
		original: 'Texte du bulletin',
		originalIn: 'Texte du bulletin, en {language}',
		'language.en': 'anglais',
		'language.de': 'allemand',
		'language.it': 'italien',
		'language.fr': 'français',
		band: '{level} {where}',
		official: 'Lire le bulletin complet du service',
		unavailable: 'Le bulletin n’a pas pu être lu pour l’instant.',
		stale: 'Bulletin plus ancien que d’habitude : le service n’a pas répondu.',
		advice: 'En montagne, le bulletin du service fait foi : lisez-le en entier avant de partir.',
		activity: 'Activité avalancheuse'
	},
	en: {
		title: 'Avalanche bulletin',
		'level.1': '1 · Low',
		'level.2': '2 · Moderate',
		'level.3': '3 · Considerable',
		'level.4': '4 · High',
		'level.5': '5 · Very high',
		'problem.new_snow': 'New snow',
		'problem.wind_slab': 'Wind slab',
		'problem.persistent_weak_layers': 'Persistent weak layers',
		'problem.wet_snow': 'Wet snow',
		'problem.gliding_snow': 'Gliding snow',
		'problem.cornices': 'Cornices',
		'problem.favourable_situation': 'Favourable situation',
		'problem.no_distinct_avalanche_problem': 'No distinct avalanche problem',
		summary: 'Avalanches: danger {level}',
		summaryNone: 'Avalanches: no current bulletin (off season)',
		none: 'No current bulletin for this area: off season, or not published yet.',
		region: 'Area: {name}',
		valid: 'Valid until {date}',
		above: 'above {m}',
		below: 'below {m}',
		between: 'from {low} to {high}',
		aspects: 'aspects {list}',
		snowpack: 'Snowpack',
		tendency: 'Outlook',
		original: 'Text of the bulletin',
		originalIn: 'Text of the bulletin, in {language}',
		'language.en': 'English',
		'language.de': 'German',
		'language.it': 'Italian',
		'language.fr': 'French',
		band: '{level} {where}',
		official: 'Read the full bulletin of the service',
		unavailable: 'The bulletin could not be read for now.',
		stale: 'Older bulletin than usual: the service did not answer.',
		advice: 'In the mountains the bulletin of the service prevails: read it in full before you go.',
		activity: 'Avalanche activity'
	}
} as const;

export type AvalancheTextKey = keyof (typeof TEXT)['fr'];

export function avalancheText(
	lang: Lang,
	key: AvalancheTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}

export function avalancheLevelLabel(lang: Lang, lvl: number): string {
	return avalancheText(lang, `level.${lvl}` as AvalancheTextKey);
}

/** The name of a problem; the service's own word when it is not one of the European ones. */
export function avalancheProblemLabel(lang: Lang, type: string): string {
	const key = `problem.${type}`;
	return key in TEXT[lang] ? avalancheText(lang, key as AvalancheTextKey) : type.replaceAll('_', ' ');
}

/** The heading of the bulletin's texts: the language is said only when it is not the page's. */
export function originalLabel(lang: Lang, bulletinLang: string | null): string {
	const code = bulletinLang?.slice(0, 2).toLowerCase() ?? null;
	const key = `language.${code}`;
	if (!code || code === lang || !(key in TEXT[lang])) return avalancheText(lang, 'original');
	return avalancheText(lang, 'originalIn', { language: avalancheText(lang, key as AvalancheTextKey) });
}

const ASPECT_FR: Record<string, string> = { W: 'O', NW: 'NO', SW: 'SO' };

/** The compass points, in French with O for west. */
export function aspectLabel(lang: Lang, aspect: string): string {
	return lang === 'fr' ? (ASPECT_FR[aspect] ?? aspect) : aspect;
}

/** The band of altitude of a problem, in words, or null when the bulletin gives none (the treeline in words). */
export function elevationText(
	lang: Lang,
	p: { lowerM: string | null; upperM: string | null }
): string | null {
	const at = (b: string) =>
		/^\d+$/.test(b)
			? `${b} m`
			: b === 'treeline'
				? lang === 'fr'
					? 'la limite des forêts'
					: 'the treeline'
				: b;
	if (p.lowerM && p.upperM) return avalancheText(lang, 'between', { low: at(p.lowerM), high: at(p.upperM) });
	if (p.lowerM) return avalancheText(lang, 'above', { m: at(p.lowerM) });
	if (p.upperM) return avalancheText(lang, 'below', { m: at(p.upperM) });
	return null;
}
