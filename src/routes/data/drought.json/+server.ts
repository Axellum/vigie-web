import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getDrought, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
		error(400, 'lat and lon must be finite coordinates');
	}
	try {
		const { value, stale } = await getDrought(lat, lon);
		if (!value || value.status === 'outside_coverage') {
			return json(
				{ status: 'outside_coverage', zones: [], stale: false },
				{ headers: cacheHeaders(TTL_S.drought) }
			);
		}
		return json({ ...value, stale: value.stale || stale }, { headers: cacheHeaders(TTL_S.drought) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
