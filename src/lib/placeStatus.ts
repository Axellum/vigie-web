// What a followed place shows on the home page, as a small card: the official warnings in force there, matched in
// the browser from the warnings of the covered countries around it, as "near me" does (the position is never
// sent), and a line that says them. Pure functions.
import { t, type Key, type Lang } from './i18n';
import { maxLevel, rank } from './levels';
import { warningsAt, type Place } from './near';
import { untilPhrase, warningLabel } from './sentence';
import type { Level, WarningsData, WarningSummary } from './types';

/** What the page knows of one country's warnings: nothing yet, loading, read, or failed. */
export type CountryWarnings = { status: 'loading' | 'ok' | 'error'; data?: WarningsData } | undefined;

export type PlaceStatus =
	| { kind: 'nosource' }
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'none' }
	/** Warnings whose area holds the place. */
	| { kind: 'here'; level: Level | null; warnings: WarningSummary[] }
	/** Warnings of the place's country that the source gives without an area: they can only be said to concern it. */
	| { kind: 'country'; level: Level | null; n: number };

/**
 * The status of a place from the covered countries near it (`countriesNear`) and their states, and from the
 * country it is in (`countryAt`: undefined while the borders load, null outside every country). The same order as
 * "near me": no source, the warnings here, loading, failed, the country's warnings without an area, nothing.
 */
export function placeStatus(
	place: Place,
	near: { cc: string; state: CountryWarnings }[],
	country: string | null | undefined,
	served: readonly string[]
): PlaceStatus {
	const here: WarningSummary[] = [];
	const unplaced: WarningSummary[] = [];
	for (const { cc, state } of near) {
		if (!state?.data) continue;
		const found = warningsAt(state.data, place);
		here.push(...found.here.map((h) => h.warning));
		if (cc === country) unplaced.push(...found.unplaced);
	}
	if (
		near.length === 0 ||
		(here.length === 0 && (country === null || (country !== undefined && !served.includes(country))))
	)
		return { kind: 'nosource' };
	if (here.length) return { kind: 'here', level: maxLevel(here.map((w) => w.level)), warnings: here };
	if (
		near.some(({ state }) => !state || (state.status === 'loading' && !state.data)) ||
		country === undefined
	)
		return { kind: 'loading' };
	if (near.some(({ state }) => state?.status === 'error')) return { kind: 'failed' };
	if (unplaced.length)
		return { kind: 'country', level: maxLevel(unplaced.map((w) => w.level)), n: unplaced.length };
	return { kind: 'none' };
}

const levelWord = (lang: Lang, level: Level | null) =>
	level ? t(lang, `level.${level}` as Key) : t(lang, 'level.none');

/**
 * The line of a card: the level and until when, then what ("Rouge jusqu'à 23 h · pluie-inondation"); the issuer's
 * words alone when they already name the level ("Vigilance rouge pluie-inondation, jusqu'à 23 h").
 */
export function placeLine(lang: Lang, status: PlaceStatus, now: number): string {
	if (status.kind === 'nosource') return t(lang, 'point.placeNoSource');
	if (status.kind === 'loading') return t(lang, 'point.placeLoading');
	if (status.kind === 'failed') return t(lang, 'point.placeFailed');
	if (status.kind === 'none') return t(lang, 'point.placeNone');
	if (status.kind === 'country')
		return t(lang, 'point.placeCountry', { level: levelWord(lang, status.level) });
	const highest = status.warnings.filter((w) => rank(w.level) === rank(status.level));
	const labels = [...new Set(highest.map((w) => warningLabel(w, lang)).filter((l): l is string => !!l))];
	const what =
		labels.length > 2 ? `${labels.slice(0, 2).join(', ')} (+${labels.length - 2})` : labels.join(', ');
	const word = levelWord(lang, status.level);
	const ends = highest.map((w) => w.ends ?? w.expires).filter((v): v is number => v != null && v > now);
	const until = ends.length ? untilPhrase(lang, Math.max(...ends), now) : null;
	if (status.level && labels.length && labels.every((l) => l.toLowerCase().includes(word.toLowerCase())))
		return until ? `${what}, ${until}` : what;
	const head = until ? `${word} ${until}` : word;
	return what ? `${head} · ${what}` : head;
}
