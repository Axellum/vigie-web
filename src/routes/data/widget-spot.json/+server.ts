import { error, json } from '@sveltejs/kit';
import { parseWidgetParams } from '#lib/widget/params.js';
import { widgetSpot } from '#lib/server/widgetSpot.js';
import type { RequestHandler } from './$types';

/** The surf spot of the widget page, as the page itself draws it (`?spot=<id>&lang=<lang>`): the page asks for it when the server
 *  did not have it in time, and again every few minutes. Never kept by a cache: the verdicts move with the hour. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { spot } = parseWidgetParams(url.searchParams);
	if (!spot) error(400, 'spot is required');
	return json(await widgetSpot(spot, locals.lang), {
		headers: { 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow' }
	});
};
