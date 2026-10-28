import { error, json } from '@sveltejs/kit';
import { ECLIPSE_DATE } from '#lib/eclipse.js';
import {
	ApiError,
	BudgetError,
	cacheHeaders,
	eclipseSoon,
	getEclipsePlace,
	TTL_S
} from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** One eclipse seen from a place (`date`, `lat`, `lon`): its contacts, the share hidden, the disc, the clouds near the date. */
export const GET: RequestHandler = async ({ url }) => {
	const date = url.searchParams.get('date') ?? '';
	const rawLat = url.searchParams.get('lat'),
		rawLon = url.searchParams.get('lon');
	const lat = Number(rawLat),
		lon = Number(rawLon);
	if (!ECLIPSE_DATE.test(date)) error(400, 'date is YYYY-MM-DD');
	if (!(rawLat?.trim() && rawLon?.trim() && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
		error(400, 'lat and lon are required');
	}
	try {
		const { value, stale } = await getEclipsePlace(date, lat, lon);
		const ttl = eclipseSoon(date) ? TTL_S.eclipseSoon : TTL_S.eclipsePlace;
		return json({ ...value, stale }, { headers: cacheHeaders(ttl) });
	} catch (e) {
		if (e instanceof BudgetError) {
			return json(
				{ reason: 'budget' },
				{ status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '3600' } }
			);
		}
		if (e instanceof ApiError) error(e.status === 404 ? 404 : 502, e.message);
		throw e;
	}
};
