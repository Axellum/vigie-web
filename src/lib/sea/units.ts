// The wind in knots or in km/h, as the visitor chose. The API gives and asks knots; 1 knot is 1.852 km/h (the definition of the
// nautical mile), so the conversion is exact and a range typed in km/h goes back to the same knots.
import { number } from '../format';
import type { Lang } from '../i18n';
import type { WindUnit } from './choice';

export const KMH_PER_KN = 1.852;

export const toKn = (value: number, unit: WindUnit): number => (unit === 'kn' ? value : value / KMH_PER_KN);
export const fromKn = (kn: number, unit: WindUnit): number => (unit === 'kn' ? kn : kn * KMH_PER_KN);

/** The unit as it is written after a figure. */
export function unitLabel(lang: Lang, unit: WindUnit): string {
	return unit === 'kn' ? (lang === 'fr' ? 'nœuds' : 'kn') : 'km/h';
}

/** A wind given in knots, in the unit chosen: `18 nœuds`, `33 km/h`. */
export function windText(lang: Lang, kn: number, unit: WindUnit): string {
	return `${number(lang, fromKn(kn, unit), 0)} ${unitLabel(lang, unit)}`;
}

/** A wind range given in knots, in the unit chosen: `12 à 25 nœuds`, `22 à 46 km/h`. */
export function windRangeText(lang: Lang, range: { min: number; max: number }, unit: WindUnit): string {
	const word = lang === 'fr' ? 'à' : 'to';
	return `${number(lang, fromKn(range.min, unit), 0)} ${word} ${number(lang, fromKn(range.max, unit), 0)} ${unitLabel(lang, unit)}`;
}
