import { error, json } from '@sveltejs/kit';
import type { ActivitiesForecast } from '#lib/activities.js';
import { ApiError, cacheHeaders, getActivities, getSurfForecast, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** The card of one spot on the sea map: its forecast for the next three days and its four verdicts, as the spot's page has them
 *  (the same cache, so that opening the card then the page costs the API nothing more). 404 for a spot the API does not know; the
 *  verdicts are null when they do not answer, and the card says so. The same for everybody. */
export const GET: RequestHandler = async ({ params }) => {
	const cached = await getSurfForecast(params.id).catch((e) => {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	});
	if (!cached) error(404, 'No such surf spot');
	let verdicts: ActivitiesForecast | null = null;
	try {
		verdicts = (await getActivities(params.id))?.value ?? null;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	return json(
		{ forecast: cached.value, verdicts, stale: cached.stale },
		{
			headers: verdicts
				? cacheHeaders(Math.min(TTL_S.surf, TTL_S.activities))
				: { 'cache-control': 'public, max-age=60, s-maxage=60' }
		}
	);
};
