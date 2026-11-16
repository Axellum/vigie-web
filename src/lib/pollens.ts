// European pollen concentrations (`GET /v1/pollens`, CAMS Europe through Open-Meteo Air Quality).
// The API gives grains per cubic metre and nothing else: no health threshold is invented here either, the figures are
// shown as they are, with the species that leads. Outside Europe the API answers `outside_coverage` and nothing shows.
import type { Lang } from './i18n';

export const POLLEN_SPECIES = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'] as const;
export type PollenSpecies = (typeof POLLEN_SPECIES)[number];

export interface PollenDay {
	date: string;
	/** The peak of the day per species, grains/m³; null when the model gave nothing. */
	max: Record<PollenSpecies, number | null>;
}

export interface PollensResponse {
	status: 'available' | 'outside_coverage' | 'unavailable';
	observedTime: string | null;
	current: Record<PollenSpecies, number | null>;
	daily: PollenDay[];
	dominant: PollenSpecies | null;
	stale: boolean;
	attribution: string | null;
}

/** Below this peak (grains/m³) a species is left out: the model gives tiny figures all year round. */
export const POLLEN_SHOWN_FROM = 1;

const STATUSES = new Set(['available', 'outside_coverage', 'unavailable']);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function counts(raw: unknown, suffix: string): Record<PollenSpecies, number | null> {
	const r = obj(raw);
	return Object.fromEntries(POLLEN_SPECIES.map((sp) => [sp, num(r[`${sp}${suffix}`])])) as Record<
		PollenSpecies,
		number | null
	>;
}

/** Parse `GET /v1/pollens`; null only for a malformed answer. */
export function pollensFromApi(raw: unknown): PollensResponse | null {
	const r = obj(raw);
	const status = str(r.status);
	if (!status || !STATUSES.has(status)) return null;
	const p = obj(r.pollens);
	const daily = (Array.isArray(p.daily) ? p.daily : []).flatMap((d): PollenDay[] => {
		const date = str(obj(d).date);
		return date ? [{ date, max: counts(d, '_max_grains_m3') }] : [];
	});
	const dominant = str(p.dominant_species);
	return {
		status: status as PollensResponse['status'],
		observedTime: str(p.observed_time),
		current: counts(p.current, '_grains_m3'),
		daily,
		dominant:
			dominant && (POLLEN_SPECIES as readonly string[]).includes(dominant)
				? (dominant as PollenSpecies)
				: null,
		stale: r.stale === true || p.stale === true,
		attribution: str(r.attribution) ?? str(p.attribution)
	};
}

/** The species worth a line, the highest peak over the days first, with that peak. */
export function pollenPeaks(value: PollensResponse): { species: PollenSpecies; peak: number }[] {
	const out: { species: PollenSpecies; peak: number }[] = [];
	for (const species of POLLEN_SPECIES) {
		const peak = Math.max(0, ...value.daily.map((d) => d.max[species] ?? 0), value.current[species] ?? 0);
		if (peak >= POLLEN_SHOWN_FROM) out.push({ species, peak });
	}
	return out.sort((a, b) => b.peak - a.peak);
}

const TEXT = {
	fr: {
		title: 'Pollens',
		'species.alder': 'Aulne',
		'species.birch': 'Bouleau',
		'species.grass': 'Graminées',
		'species.mugwort': 'Armoise',
		'species.olive': 'Olivier',
		'species.ragweed': 'Ambroisie',
		summary: 'Pollens : {species} en tête, jusqu’à {peak} grains/m³',
		summaryNone: 'Pollens : rien de notable sur 4 jours',
		none: 'Aucun pollen notable prévu sur les 4 prochains jours (moins d’un grain par m³ pour les six espèces suivies).',
		unit: 'Pic du jour, en grains par m³ d’air.',
		species: 'Espèce',
		now: 'Maintenant',
		unavailable: 'Les pollens n’ont pas pu être lus pour l’instant.',
		stale: 'Chiffres plus anciens que d’habitude : le service n’a pas répondu.',
		model:
			'Prévision du modèle européen CAMS, pas un comptage : pour une allergie, suivez l’avis de votre médecin.'
	},
	en: {
		title: 'Pollen',
		'species.alder': 'Alder',
		'species.birch': 'Birch',
		'species.grass': 'Grass',
		'species.mugwort': 'Mugwort',
		'species.olive': 'Olive',
		'species.ragweed': 'Ragweed',
		summary: 'Pollen: {species} leads, up to {peak} grains/m³',
		summaryNone: 'Pollen: nothing notable over 4 days',
		none: 'No notable pollen expected over the next 4 days (under one grain per m³ for the six species followed).',
		unit: 'Peak of the day, in grains per m³ of air.',
		species: 'Species',
		now: 'Now',
		unavailable: 'The pollen could not be read for now.',
		stale: 'Older figures than usual: the service did not answer.',
		model: 'A forecast of the European CAMS model, not a count: for an allergy, follow your doctor’s advice.'
	}
} as const;

export type PollenTextKey = keyof (typeof TEXT)['fr'];

export function pollenText(
	lang: Lang,
	key: PollenTextKey,
	vars: Record<string, string | number> = {}
): string {
	let out: string = TEXT[lang][key];
	for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}

export function speciesLabel(lang: Lang, species: PollenSpecies): string {
	return pollenText(lang, `species.${species}` as PollenTextKey);
}
