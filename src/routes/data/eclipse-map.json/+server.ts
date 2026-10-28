import { error, json } from '@sveltejs/kit';
import { ECLIPSE_DATE } from '#lib/eclipse.js';
import { ApiError, cacheHeaders, getEclipseMap, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** The map of one eclipse (`date`): the bands of the share hidden, the path and its central line. */
export const GET: RequestHandler = async ({ url }) => {
	const date = url.searchParams.get('date') ?? '';
	if (!ECLIPSE_DATE.test(date)) error(400, 'date is YYYY-MM-DD');
	try {
		const { value } = await getEclipseMap(date);
		return json(value, { headers: cacheHeaders(TTL_S.eclipses) });
	} catch (e) {
		if (e instanceof ApiError) error(e.status === 404 ? 404 : 502, e.message);
		throw e;
	}
};
