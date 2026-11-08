// What a visitor chose on the sea pages, without an account: the activity, the unit of the wind, and the kite's wind range. It
// stays in this browser (localStorage) and is never sent to the site; the page reads it once it is shown, so that a page
// the server wrote for everybody does not depend on it. Where the storage refuses (private window, blocked), the page works
// the same and asks again each time.
import { ACTIVITY_IDS, type ActivityId } from '../activities';

export const SEA_KEY = 'vigie-sea';

export type WindUnit = 'kn' | 'kmh';
export const WIND_UNITS: WindUnit[] = ['kn', 'kmh'];

/** The wind range of the kite, wing or windsurf, in knots (the API's unit): the one asked for, else the API's default. */
export interface WindRangeKn {
	min: number;
	max: number;
}

export interface SeaChoice {
	activity: ActivityId | null;
	unit: WindUnit;
	wind: WindRangeKn | null;
}

export const DEFAULT_CHOICE: SeaChoice = { activity: null, unit: 'kmh', wind: null };

/** The API takes a wind range up to 60 knots (`0 < min < max`). */
export const MAX_WIND_KN = 60;

/** A range the API would accept, rounded to a tenth of a knot; null for anything else. */
export function validRange(min: unknown, max: unknown): WindRangeKn | null {
	if (typeof min !== 'number' || typeof max !== 'number') return null;
	if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
	const lo = Math.round(min * 10) / 10;
	const hi = Math.round(max * 10) / 10;
	return lo > 0 && lo < hi && hi <= MAX_WIND_KN ? { min: lo, max: hi } : null;
}

/** The choice stored in the browser; anything unreadable gives the default one. */
export function parseChoice(raw: string | null): SeaChoice {
	let value: unknown;
	try {
		value = JSON.parse(raw ?? 'null');
	} catch {
		return DEFAULT_CHOICE;
	}
	if (!value || typeof value !== 'object') return DEFAULT_CHOICE;
	const { activity, unit, wind } = value as Record<string, unknown>;
	const w = wind && typeof wind === 'object' ? (wind as Record<string, unknown>) : {};
	return {
		activity: ACTIVITY_IDS.includes(activity as ActivityId) ? (activity as ActivityId) : null,
		unit: WIND_UNITS.includes(unit as WindUnit) ? (unit as WindUnit) : DEFAULT_CHOICE.unit,
		wind: validRange(w.min, w.max)
	};
}

export function readChoice(): SeaChoice {
	try {
		return parseChoice(localStorage.getItem(SEA_KEY));
	} catch {
		return DEFAULT_CHOICE;
	}
}

/** Keeps the choice in this browser; false when the storage refuses it. */
export function writeChoice(choice: SeaChoice): boolean {
	try {
		localStorage.setItem(SEA_KEY, JSON.stringify(choice));
		return true;
	} catch {
		return false;
	}
}

/** The choice with only these fields changed, stored; the new choice is returned even when the storage refuses it. */
export function updateChoice(change: Partial<SeaChoice>): SeaChoice {
	const next = { ...readChoice(), ...change };
	writeChoice(next);
	return next;
}
