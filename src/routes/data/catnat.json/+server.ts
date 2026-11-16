import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getCatNat, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The natural disasters recognised near a place, rounded to the weather grid (`GET /v1/history/catnat`).
export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		error(400, 'lat and lon must be finite coordinates');
	}
	try {
		const { value, stale } = await getCatNat(lat, lon);
		if (!value) error(502, 'unexpected answer of the API');
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.catnat) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
