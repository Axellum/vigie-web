import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getWindField, TTL_S } from '#lib/server/vigie.js';
import type { WindField } from '#lib/windField.js';
import type { RequestHandler } from './$types';

// The forecast wind of the map: the grids of the hour and the addresses of their images on this site (`$lib/windField`).
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getWindField();
		if (!value) error(502, 'The forecast wind could not be read');
		const body: WindField = { ...value, stale: value.stale || stale };
		return json(body, { headers: cacheHeaders(TTL_S.windField) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
