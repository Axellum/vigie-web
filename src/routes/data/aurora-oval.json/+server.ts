import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getAuroraOval, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** NOAA's OVATION aurora forecast as map bands (the same answer for every visitor). */
export const GET: RequestHandler = async () => {
	try {
		const { value } = await getAuroraOval();
		return json(value, { headers: cacheHeaders(TTL_S.aurora) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
