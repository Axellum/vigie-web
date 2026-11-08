import { error, json } from '@sveltejs/kit';
import { isPlaceType, MAX_Q, type PlaceType } from '#lib/sea/places.js';
import { ApiError, cacheHeaders, getSeaPlaces, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** The places of the coast around a position (the page "Around my position"), nearest first. The position is rounded to 0.01
 *  degree (about a kilometre) before it is asked of the API, so that it is also the key of the cache; the answer is the catalogue's,
 *  the same for everybody, and no provider is asked. */
export const GET: RequestHandler = async ({ url }) => {
	const read = (name: string) => {
		const raw = url.searchParams.get(name);
		return raw === null || raw.trim() === '' ? NaN : Number(raw);
	};
	const lat = read('lat'),
		lon = read('lon');
	if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) error(400, 'lat and lon are required');
	const radius = read('radius_km');
	const limit = read('limit');
	const types = url.searchParams.getAll('type').filter((t): t is PlaceType => isPlaceType(t));
	const q = (url.searchParams.get('q') ?? '').slice(0, MAX_Q);
	try {
		const answer = await getSeaPlaces({
			types,
			near: { lat, lon, radiusKm: Number.isFinite(radius) ? Math.min(50, Math.max(1, radius)) : 25 },
			q,
			limit: Number.isFinite(limit) ? Math.min(30, Math.max(1, limit)) : 20
		});
		return json(answer.value, { headers: cacheHeaders(TTL_S.seaPlaces) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
