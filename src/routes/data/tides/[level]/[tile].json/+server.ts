import { error, json } from '@sveltejs/kit';
import { isTideTile, tideLevelById } from '#lib/tides.js';
import { ApiError, cacheHeaders, getTideTile, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// One tile of the tide now along the coasts of the world map: /data/tides/<level>/<x>_<y>.json ($lib/tides).
export const GET: RequestHandler = async ({ params }) => {
	const level = tideLevelById(params.level);
	const m = /^(\d{1,3})_(\d{1,3})$/.exec(params.tile);
	const [x, y] = m ? [Number(m[1]), Number(m[2])] : [-1, -1];
	if (!level || !isTideTile(level, x, y)) error(404, 'No such tile of tides');
	try {
		const { value, stale } = await getTideTile(level, x, y);
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.tideCoast) });
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) error(404, 'The API of this site computes no tides');
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
