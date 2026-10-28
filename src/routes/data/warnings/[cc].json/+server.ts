import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getWarnings, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The warnings of one country for the map: short texts and shared shapes (the full texts are in
// /data/warning/<cc>/<id>.json).
export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await getWarnings(params.cc);
		if (!result) error(404, 'No source of official warnings for this country');
		return json({ ...result.value.data, stale: result.stale }, { headers: cacheHeaders(TTL_S.warnings) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
