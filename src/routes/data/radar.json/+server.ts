import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getRadar, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The images of the rain radar of France (the last 35 minutes) and the legend, as the map card needs them.
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getRadar();
		if (!value) error(404, 'No radar image at the moment');
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.radar) });
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) error(404, 'The API of this site has no radar');
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
