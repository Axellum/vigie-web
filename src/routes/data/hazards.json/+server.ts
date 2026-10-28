import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getHazards, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getHazards();
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.hazards) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
