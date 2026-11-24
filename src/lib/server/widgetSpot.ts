// The surf spot of the widget page (/widget), drawn by the server as the television screen draws it, from the site's cache. The
// page and `/data/widget-spot.json` share it: the page waits for it a moment only (`SPOT_WAIT_MS`), and when the answer is not
// there by then (the cache of the spot ran out, the API reads its sources again: 1 to 9 s measured on a quiet morning), the
// browser asks for it again and finds the reading under way or made.
import { buildScreen, type TvScreen } from '#lib/tv/model.js';
import { TV_DEFAULTS } from '#lib/tv/params.js';
import type { SurfSpot } from '#lib/surf.js';
import { frenchClock } from '#lib/widget/model.js';
import {
	ApiError,
	BudgetError,
	getActivities,
	getPoint,
	getSurfForecast,
	getTides
} from '#lib/server/vigie.js';
import type { Lang } from '#lib/i18n.js';

/** `pending`: the server did not have it in time, the browser asks `/data/widget-spot.json`. */
export interface WidgetSpot {
	status: 'none' | 'pending' | 'ok' | 'unknown' | 'unavailable';
	screen: TvScreen | null;
}

/** How long the page waits for its spot before it answers without it: a spot in the cache takes a few milliseconds. */
export const SPOT_WAIT_MS = 150;

/** The answer of a call to the API, or undefined when the API did not answer (any other error goes up). */
export async function settled<T>(call: Promise<T>): Promise<T | undefined> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError || e instanceof BudgetError) return undefined;
		throw e;
	}
}

/**
 * `work` if it ends within `ms`, else `late`. The work goes on: its answer fills the cache for the next request. Its error, if it
 * comes after `ms`, is dropped here (the next request meets it again), so that it never ends the process as an unhandled one.
 */
export function within<T>(work: Promise<T>, ms: number, late: T): Promise<T> {
	work.catch(() => {});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const wait = new Promise<T>((resolve) => (timer = setTimeout(() => resolve(late), ms)));
	return Promise.race([work, wait]).finally(() => clearTimeout(timer));
}

export async function widgetSpot(spotId: string, lang: Lang): Promise<WidgetSpot> {
	const [activities, forecast] = await Promise.all([
		settled(getActivities(spotId)),
		settled(getSurfForecast(spotId))
	]);
	// null is the API saying that it does not know the spot; undefined is the API not answering.
	if (activities === null || forecast === null) return { status: 'unknown', screen: null };
	const spot: SurfSpot | undefined = activities?.value.spot ?? forecast?.value.spot;
	if (!spot) return { status: 'unavailable', screen: null };
	const [tide, sky] = await Promise.all([
		settled(getTides(spot.lat, spot.lon)),
		settled(getPoint(spot.lat, spot.lon, true))
	]);
	const screen = buildScreen({
		now: Math.floor(Date.now() / 1000),
		lang,
		params: { ...TV_DEFAULTS, panels: [...TV_DEFAULTS.panels], spot: spot.id },
		spot,
		activities: activities ?? null,
		forecast: forecast ?? null,
		tide: tide ?? null,
		sky: sky ?? null
	});
	if (lang === 'fr') {
		for (const a of screen.activities) a.slot = a.slot && frenchClock(a.slot);
		for (const e of screen.tide?.next ?? []) e.time = frenchClock(e.time);
	}
	return { status: 'ok', screen };
}
