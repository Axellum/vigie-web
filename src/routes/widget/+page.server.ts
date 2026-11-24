import { parseWidgetParams, type WidgetParams } from '#lib/widget/params.js';
import { servedCodes } from '#lib/server/vigie.js';
import { settled, SPOT_WAIT_MS, widgetSpot, within, type WidgetSpot } from '#lib/server/widgetSpot.js';
import type { PageServerLoad } from './$types';

export interface WidgetPageData {
	params: WidgetParams;
	/** The countries that have official warnings: the browser matches the place against theirs. */
	served: string[];
	/** The surf spot of the address, drawn by the server as the TV screen draws it; `none` without one, `pending` when it was not
	 *  ready in time (the browser asks for it). */
	spot: WidgetSpot;
}

// The widget page: the place is after the `#` and never reaches the server (the browser does its matching); the surf spot is in
// the query and is drawn here, from the site's cache, as on the TV screen. The answer is never kept by a cache: the verdicts move
// with the hour. The Windows widgets board shows nothing but a spinner until the page has come: the page does not wait for a spot
// whose cache ran out (`SPOT_WAIT_MS`).
export const load: PageServerLoad = async ({ url, locals, setHeaders }): Promise<WidgetPageData> => {
	const params = parseWidgetParams(url.searchParams);
	setHeaders({ 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow' });
	// The list of countries and the spot's data do not wait for each other.
	const [served, spot] = await Promise.all([
		settled(servedCodes()).then((codes) => codes ?? []),
		params.spot
			? within(widgetSpot(params.spot, locals.lang), SPOT_WAIT_MS, {
					status: 'pending' as const,
					screen: null
				})
			: Promise.resolve({ status: 'none' as const, screen: null })
	]);
	return { params, served, spot };
};
