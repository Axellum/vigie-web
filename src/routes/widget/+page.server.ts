import { buildScreen, type TvScreen } from '#lib/tv/model.js';
import { TV_DEFAULTS } from '#lib/tv/params.js';
import type { SurfSpot } from '#lib/surf.js';
import { frenchClock } from '#lib/widget/model.js';
import { parseWidgetParams, type WidgetParams } from '#lib/widget/params.js';
import {
	ApiError,
	BudgetError,
	getActivities,
	getPoint,
	getSurfForecast,
	getTides,
	servedCodes
} from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

export interface WidgetPageData {
	params: WidgetParams;
	/** The countries that have official warnings: the browser matches the place against theirs. */
	served: string[];
	/** The surf spot of the address, drawn by the server as the TV screen draws it; null without one. */
	spot: { status: 'none' | 'ok' | 'unknown' | 'unavailable'; screen: TvScreen | null };
}

/** The answer of a call to the API, or undefined when the API did not answer (any other error goes up). */
async function settled<T>(call: Promise<T>): Promise<T | undefined> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError || e instanceof BudgetError) return undefined;
		throw e;
	}
}

// The widget page: the place is after the `#` and never reaches the server (the browser does its matching); the surf spot is in
// the query and is drawn here, from the site's cache, as on the TV screen. The answer is never kept by a cache: the verdicts move
// with the hour.
export const load: PageServerLoad = async ({ url, locals, setHeaders }): Promise<WidgetPageData> => {
	const params = parseWidgetParams(url.searchParams);
	setHeaders({ 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow' });
	const served = (await settled(servedCodes())) ?? [];
	if (!params.spot) return { params, served, spot: { status: 'none', screen: null } };

	const [activities, forecast] = await Promise.all([
		settled(getActivities(params.spot)),
		settled(getSurfForecast(params.spot))
	]);
	// null is the API saying that it does not know the spot; undefined is the API not answering.
	if (activities === null || forecast === null)
		return { params, served, spot: { status: 'unknown', screen: null } };
	const spot: SurfSpot | undefined = activities?.value.spot ?? forecast?.value.spot;
	if (!spot) return { params, served, spot: { status: 'unavailable', screen: null } };
	const [tide, sky] = await Promise.all([
		settled(getTides(spot.lat, spot.lon)),
		settled(getPoint(spot.lat, spot.lon, true))
	]);
	const screen = buildScreen({
		now: Math.floor(Date.now() / 1000),
		lang: locals.lang,
		params: { ...TV_DEFAULTS, panels: [...TV_DEFAULTS.panels], spot: spot.id },
		spot,
		activities: activities ?? null,
		forecast: forecast ?? null,
		tide: tide ?? null,
		sky: sky ?? null
	});
	if (locals.lang === 'fr') {
		for (const a of screen.activities) a.slot = a.slot && frenchClock(a.slot);
		for (const e of screen.tide?.next ?? []) e.time = frenchClock(e.time);
	}
	return { params, served, spot: { status: 'ok', screen } };
};
