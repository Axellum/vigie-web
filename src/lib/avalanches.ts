// Official avalanche bulletins (`GET /v1/avalanches`, CAAML v6 of the SLF for Switzerland and Liechtenstein, and of
// Avalanche.report for Tyrol, South Tyrol and Trentino). The danger level is the European scale 1 to 5 as the service
// wrote it; the texts of the bulletin are the service's own, in the language it published (English for now).
import type { Lang } from './i18n';
import type { Level } from './types';

/** The countries the two services cover in part: asked only there, the API says whether the point is inside. */
export const AVALANCHE_COUNTRIES = new Set(['CH', 'LI', 'AT', 'IT']);

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
	problems: AvalancheProblem[];
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
		const tendency = list(b.tendency)
			.map((t) => str(obj(t).comment))
			.find((t) => t != null);
		return [
			{
				id,
				source: str(b.source) ?? '',
				lang: str(b.lang),
				validFrom: str(b.valid_from),
				validUntil: str(b.valid_until),
				maxLevel: level(b.max_danger_level),
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
	return source === 'euregio_avalanche' ? 'https://avalanche.report/' : 'https://www.slf.ch/';
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
		original: 'Texte du service, en anglais',
		official: 'Lire le bulletin complet du service',
		unavailable: 'Le bulletin n’a pas pu être lu pour l’instant.',
		stale: 'Bulletin plus ancien que d’habitude : le service n’a pas répondu.',
		advice: 'En montagne, le bulletin du service fait foi : lisez-le en entier avant de partir.'
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
		original: 'Text of the service',
		official: 'Read the full bulletin of the service',
		unavailable: 'The bulletin could not be read for now.',
		stale: 'Older bulletin than usual: the service did not answer.',
		advice: 'In the mountains the bulletin of the service prevails: read it in full before you go.'
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

const ASPECT_FR: Record<string, string> = { W: 'O', NW: 'NO', SW: 'SO' };

/** The compass points, in French with O for west. */
export function aspectLabel(lang: Lang, aspect: string): string {
	return lang === 'fr' ? (ASPECT_FR[aspect] ?? aspect) : aspect;
}

/** The band of altitude of a problem, in words, or null when the bulletin gives none (the treeline in words). */
export function elevationText(lang: Lang, p: AvalancheProblem): string | null {
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
