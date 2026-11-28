import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getActivitiesOverview, getSurfOverview, TTL_S } from '#lib/server/vigie.js';
import type { SurfSpotNow } from '#lib/surf.js';
import type { RequestHandler } from './$types';

/**
 * The verdicts of every spot for the four activities (the default wind range of the kite) and the figures of the current hour of
 * the surf overview, for the sea family of the home map: the same for everybody, the page ranks the spots around its place itself
 * so that the place stays in the browser. Without the surf overview the pins keep their verdicts, as on the sea page.
 */
export const GET: RequestHandler = async () => {
	const surfRead = getSurfOverview().then(
		(read): SurfSpotNow[] => read.value.spots,
		(e): null => {
			if (e instanceof ApiError) return null;
			throw e;
		}
	);
	try {
		const read = await getActivitiesOverview(null);
		const overview = { ...read.value, stale: read.value.stale || read.stale };
		return json({ overview, surf: await surfRead }, { headers: cacheHeaders(TTL_S.seaOverview) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
