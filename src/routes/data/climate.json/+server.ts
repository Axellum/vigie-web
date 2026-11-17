import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getClimate, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The normals and records of one month near a place, rounded to the weather grid (`GET /v1/climate/normals`).
export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	const month = Number(url.searchParams.get('month'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		error(400, 'lat and lon must be finite coordinates');
	}
	if (!Number.isInteger(month) || month < 1 || month > 12) error(400, 'month must be 1 to 12');
	try {
		const { value, stale } = await getClimate(lat, lon, month);
		if (!value) error(502, 'unexpected answer of the API');
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.climate) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
