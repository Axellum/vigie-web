import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getForecast, TTL_S } from '$lib/server/vigie';
import type { RequestHandler } from './$types';

/** The forecast of a hazard that has one: a storm's cone, track and positions, a tsunami's arrival times. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await getForecast(params.id);
		if (!result) error(404, 'No such hazard, or not any more');
		return json({ ...result.value, stale: result.stale }, { headers: cacheHeaders(TTL_S.forecast) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
