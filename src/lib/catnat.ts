// The natural disasters the French State recognised in a commune since 1982 (`GET /v1/history/catnat`, GASPAR decrees).
// History, not a warning: what happened here before, by kind and by year. The API finds the commune whose centre is
// nearest to the position, and the site only sends the position rounded to the weather grid: the commune is named on
// the card so that a neighbouring one is seen as such.
import type { Lang } from './i18n';

/** The territories GASPAR covers (France and its overseas departments). */
export const CATNAT_COUNTRIES = new Set(['FR', 'GP', 'MQ', 'GF', 'RE', 'YT']);

export interface CatNatDecree {
	category: string;
	typeLabel: string;
	startDate: string | null;
	endDate: string | null;
	decreeDate: string | null;
}

export interface CatNatResponse {
	status: 'available' | 'confirmed_none' | 'outside_coverage';
	commune: { inseeCode: string; name: string; department: string | null; distanceKm: number | null } | null;
	periodStart: string | null;
	periodEnd: string | null;
	total: number;
	lastDecreeDate: string | null;
	byType: { category: string; typeLabel: string; count: number }[];
	decrees: CatNatDecree[];
	attribution: string | null;
}

const STATUSES = new Set(['available', 'confirmed_none', 'outside_coverage']);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Parse `GET /v1/history/catnat`; null only for a malformed answer. */
export function catnatFromApi(raw: unknown): CatNatResponse | null {
	const r = obj(raw);
	const status = str(r.status);
	if (!status || !STATUSES.has(status)) return null;
	const c = obj(r.commune);
	const inseeCode = str(c.insee_code);
	const name = str(c.name);
	return {
		status: status as CatNatResponse['status'],
		commune:
			inseeCode && name
				? { inseeCode, name, department: str(c.department), distanceKm: num(c.centroid_distance_km) }
				: null,
		periodStart: str(r.period_start),
		periodEnd: str(r.period_end),
		total: num(r.total_decrees) ?? 0,
		lastDecreeDate: str(r.last_decree_date),
		byType: list(r.by_type).flatMap((t) => {
			const o = obj(t);
			const category = str(o.category);
			const count = num(o.count);
			return category && count != null ? [{ category, typeLabel: str(o.type_label) ?? category, count }] : [];
		}),
		decrees: list(r.decrees).flatMap((d): CatNatDecree[] => {
			const o = obj(d);
			const category = str(o.category);
			if (!category) return [];
			return [
				{
					category,
					typeLabel: str(o.type_label) ?? category,
					startDate: str(o.start_date),
					endDate: str(o.end_date),
					decreeDate: str(o.decree_date)
				}
			];
		}),
		attribution: str(r.attribution)
	};
}

export function isCoveredCatNatCountry(cc: string | null | undefined): boolean {
	return !!cc && CATNAT_COUNTRIES.has(cc.toUpperCase());
}

const TEXT = {
	fr: {
		title: 'Catastrophes naturelles reconnues',
		summary: 'Catastrophes naturelles : {n} reconnues depuis 1982, la dernière en {year}',
		summaryOne: 'Catastrophes naturelles : 1 reconnue depuis 1982, en {year}',
		summaryNone: 'Catastrophes naturelles : aucune reconnue depuis 1982',
		commune: 'Commune de {name} ({department})',
		communeNear: 'Commune la plus proche du point arrondi : {name} ({department}), à {km} km',
		intro: 'Arrêtés de l’État reconnaissant l’état de catastrophe naturelle, de {from} à {to}.',
		none: 'Aucun arrêté de catastrophe naturelle pour cette commune sur la période.',
		event: 'Du {start} au {end}',
		eventDay: 'Le {start}',
		decree: 'arrêté du {date}',
		older: 'Et {n} plus anciens',
		official: 'Consulter Géorisques (georisques.gouv.fr)',
		history: 'C’est un historique, pas une alerte en cours.'
	},
	en: {
		title: 'Recognised natural disasters',
		summary: 'Natural disasters: {n} recognised since 1982, the latest in {year}',
		summaryOne: 'Natural disasters: 1 recognised since 1982, in {year}',
		summaryNone: 'Natural disasters: none recognised since 1982',
		commune: 'Commune of {name} ({department})',
		communeNear: 'Commune nearest the rounded point: {name} ({department}), {km} km away',
		intro: 'French State decrees recognising a natural disaster, from {from} to {to}.',
		none: 'No natural disaster decree for this commune over the period.',
		event: 'From {start} to {end}',
		eventDay: 'On {start}',
		decree: 'decree of {date}',
		older: 'And {n} older ones',
		official: 'Check Géorisques (georisques.gouv.fr)',
		history: 'This is history, not a current warning.'
	}
} as const;

export type CatNatTextKey = keyof (typeof TEXT)['fr'];

export function catnatText(
	lang: Lang,
	key: CatNatTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}

/** The English name of a kind of disaster (the API gives the French one, as GASPAR writes it). */
const CATEGORY_EN: Record<string, string> = {
	floods: 'Floods',
	drought: 'Drought',
	landslides: 'Ground movements',
	storms_cyclones: 'Storms and cyclones',
	hail_snow: 'Hail and snow',
	clay_shrink_swell: 'Clay shrink-swell',
	avalanche: 'Avalanches',
	other: 'Other'
};

export function catnatTypeLabel(lang: Lang, category: string, frenchLabel: string): string {
	return lang === 'fr' ? frenchLabel : (CATEGORY_EN[category] ?? frenchLabel);
}

/** One line of the card: a summary that says the count and the year of the latest decree. */
export function catnatSummary(lang: Lang, value: CatNatResponse): string {
	if (value.status !== 'available' || value.total === 0) return catnatText(lang, 'summaryNone');
	const year = value.lastDecreeDate?.slice(0, 4) ?? '';
	return value.total === 1
		? catnatText(lang, 'summaryOne', { year })
		: catnatText(lang, 'summary', { n: value.total, year });
}
