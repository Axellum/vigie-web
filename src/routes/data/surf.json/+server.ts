import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getSurfOverview, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** Every surf spot in short (the API's overview), the same for everybody: the page picks the spots near its place itself, so
 *  that the place stays in the browser. */
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getSurfOverview();
		return json({ ...value, stale: value.stale || stale }, { headers: cacheHeaders(TTL_S.surfOverview) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
