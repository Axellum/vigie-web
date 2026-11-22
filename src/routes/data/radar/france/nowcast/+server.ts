import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getRadarNowcast, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// PIAF +1h rain nowcast frames over metropolitan France: `/data/radar/france/nowcast`.
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getRadarNowcast();
		if (!value) error(404, 'No rain nowcast available at the moment');
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.radarNowcast) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
