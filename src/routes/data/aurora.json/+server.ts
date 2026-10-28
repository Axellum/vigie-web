import { error, json } from '@sveltejs/kit';
import { ApiError, BudgetError, cacheHeaders, getAurora, getAuroraPlace, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** NOAA's aurora data; with `lat` and `lon` (already rounded to the weather grid by the page), the estimate of the coming night. */
export const GET: RequestHandler = async ({ url }) => {
	const raw = (name: string) => url.searchParams.get(name);
	const hasPlace = raw('lat') !== null || raw('lon') !== null;
	const lat = Number(raw('lat')),
		lon = Number(raw('lon'));
	if (
		hasPlace &&
		!(raw('lat')?.trim() && raw('lon')?.trim() && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)
	) {
		error(400, 'lat and lon go together');
	}
	try {
		const { value, stale } = hasPlace ? await getAuroraPlace(lat, lon) : await getAurora();
		return json({ ...value, stale }, { headers: cacheHeaders(hasPlace ? TTL_S.auroraPlace : TTL_S.aurora) });
	} catch (e) {
		if (e instanceof BudgetError) {
			return json(
				{ reason: 'budget' },
				{ status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '3600' } }
			);
		}
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
