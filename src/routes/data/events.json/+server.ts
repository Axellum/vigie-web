import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getEvents, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** The world in events, for a home page that came before the server had read it once (it waits for the API). */
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getEvents();
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.events) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
