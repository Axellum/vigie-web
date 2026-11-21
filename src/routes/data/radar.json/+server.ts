import { error, json } from '@sveltejs/kit';
import { radarAreaFrom } from '#lib/radar.js';
import { ApiError, cacheHeaders, getRadar, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The images of the rain radar of an area (the last 35 minutes) and the legend, as the map card needs them:
// /data/radar.json?area=antilles (France without `area`).
export const GET: RequestHandler = async ({ url }) => {
	const area = radarAreaFrom(url.searchParams.get('area') ?? 'france');
	if (!area) error(404, 'No such radar area');
	try {
		const { value, stale } = await getRadar(area);
		if (!value) error(404, 'No radar image at the moment');
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.radar) });
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) error(404, 'The API of this site has no radar');
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
