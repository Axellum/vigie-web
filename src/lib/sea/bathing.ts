// The bathing tab of the card of a spot: the monitored bathing site that is the spot's own and the official class of its water, the
// stretch of coast where the card speaks of rip currents in the troughs of the beach (baïnes), and the hours when they run the
// strongest by the one official text found that gives them. Pure helpers: the card asks the site for the places and the tide.
import { distanceKm } from '../near';
import type { TideExtreme } from '../tides';
import type { SeaPlace } from './places';

/** A monitored bathing site counts as the spot's own within this distance (Vigie's choice): farther, it is another beach. */
export const BATHING_NEAR_KM = 1;
/** The circle asked of the API around the spot: the site rounds the position to 0.01 degree (up to 0.8 km away) before it asks, so
 *  the circle is wider than `BATHING_NEAR_KM` and the distance is measured again from the spot itself. */
export const BATHING_ASK_KM = 2;

export interface NearBathing {
	place: SeaPlace;
	/** From the spot (great circle). */
	km: number;
}

/** Closer than this, a site is the spot's whatever its side. */
const SAME_PLACE_KM = 0.2;
/** Farther, a site behind the beach (within 45 degrees of straight inland) is a lake or a pond, not the sea of the spot. */
const INLAND_DEG = 135;

/** Initial bearing from `a` to `b`, degrees from north. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	const rad = Math.PI / 180;
	const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
	const x =
		Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
		Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
	return (Math.atan2(y, x) / rad + 360) % 360;
}

/**
 * The monitored bathing site nearest the spot, when one is within `maxKm`; the other kinds of places are left out, and so is a site
 * behind the beach when the spot's facing is known (the list does not say whether the water is the sea or a lake).
 */
export function nearestBathing(
	places: readonly SeaPlace[],
	at: { lat: number; lon: number },
	facing: number | null = null,
	maxKm = BATHING_NEAR_KM
): NearBathing | null {
	let best: NearBathing | null = null;
	for (const place of places) {
		if (place.type !== 'bathing') continue;
		const km = distanceKm(at, place);
		if (km > maxKm || (best && km >= best.km)) continue;
		if (facing != null && km > SAME_PLACE_KM) {
			const off = Math.abs(((bearingDeg(at, place) - facing + 540) % 360) - 180);
			if (off > INLAND_DEG) continue;
		}
		best = { place, km };
	}
	return best;
}

/** The page of the prefecture of Charente-Maritime on safe bathing: the one official text found (27 November 2026) that says when
 *  the current of a baïne runs the strongest, "the first three hours of the rising tide and the last three hours of the falling
 *  tide", that is from three hours before to three hours after low water. */
export const BAINES_SOURCE =
	'https://www.charente-maritime.gouv.fr/Actions-de-l-Etat/Securite/Securite-civile/Prevention-baignades';
export const BAINES_HALF_WINDOW_S = 3 * 3600;

/**
 * Whether the card speaks of baïnes at a spot: a rule of Vigie, as no official text draws where they are ("all along the sandy
 * beaches of the Atlantic coast", says the prefecture). The ocean beaches from Charente-Maritime to the Basque Country: between
 * 43.35° and 46.4° N, west of 1° W, facing the open Atlantic (between south-west and north-north-west), and not on rock.
 */
export function onBaineCoast(spot: {
	lat: number;
	lon: number;
	facing: number | null;
	bottom?: string | null;
}): boolean {
	if (!(spot.lat >= 43.35 && spot.lat <= 46.4 && spot.lon <= -1)) return false;
	if (spot.facing == null || spot.facing < 200 || spot.facing > 340) return false;
	return spot.bottom !== 'rock';
}

export interface BaineWindow {
	/** The low water the window is around. */
	low: TideExtreme;
	from: number;
	to: number;
	/** True when `now` is inside the window. */
	now: boolean;
}

/** The window of the low water under way or the next one (from three hours before to three hours after it), when it starts within
 *  `horizonS` of `now`; null without a low water in the curve. */
export function baineWindow(
	extremes: readonly TideExtreme[],
	now: number,
	horizonS = 24 * 3600
): BaineWindow | null {
	const lows = extremes.filter((e) => e.kind === 'low').sort((a, b) => a.t - b.t);
	for (const low of lows) {
		const from = low.t - BAINES_HALF_WINDOW_S;
		const to = low.t + BAINES_HALF_WINDOW_S;
		if (to <= now) continue;
		if (from - now > horizonS) return null;
		return { low, from, to, now: from <= now };
	}
	return null;
}
