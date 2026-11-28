import { error, json } from '@sveltejs/kit';
import { snapToGrid } from '#lib/near.js';
import { ApiError, cacheHeaders, getTowns } from '#lib/server/vigie.js';
import { cellKey, TOWNS_PER_REQUEST } from '#lib/townWeather.js';
import type { RequestHandler } from './$types';

/**
 * The weather of the towns the home map names in view (`at=lat,lon`, repeated, at most 40): for each cell of the weather grid
 * (about 5 km) they fall in, in the order asked, its weather now, the rain of the hour, the coming hours and days. The page sends
 * the positions already on the grid; the server rounds them again and drops the repeats.
 */
export const GET: RequestHandler = async ({ url }) => {
	const values = url.searchParams.getAll('at');
	if (values.length < 1 || values.length > TOWNS_PER_REQUEST) error(400, `1 to ${TOWNS_PER_REQUEST} places`);
	const cells = new Map<string, { lat: number; lon: number }>();
	for (const value of values) {
		const [lat, lon, ...rest] = value.split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
		if (rest.length || !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) error(400, 'at=lat,lon');
		cells.set(cellKey({ lat, lon }), snapToGrid({ lat, lon }));
	}
	try {
		const answer = await getTowns([...cells.values()]);
		// A part not read, or the share of the day used up, is asked again soon; a whole answer is kept as a point's.
		const whole = !answer.paused && answer.towns.every((t) => t.weather);
		return json(answer, { headers: whole ? cacheHeaders(300) : { 'cache-control': 'no-store' } });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
