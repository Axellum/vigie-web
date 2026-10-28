import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getTides, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** The tide at a coastal point, computed by the API. 204 (nothing) where the tide model has no cell near the point (inland): an
 *  answer, not an error, so that a browser does not log one for every place away from the sea. */
export const GET: RequestHandler = async ({ url }) => {
	const read = (name: string) => {
		const raw = url.searchParams.get(name);
		return raw === null || raw.trim() === '' ? NaN : Number(raw);
	};
	const lat = read('lat'),
		lon = read('lon');
	if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) error(400, 'lat and lon are required');
	try {
		const answer = await getTides(lat, lon);
		if (!answer) return new Response(null, { status: 204, headers: cacheHeaders(TTL_S.tides) });
		return json({ ...answer.value, stale: answer.stale }, { headers: cacheHeaders(TTL_S.tides) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
