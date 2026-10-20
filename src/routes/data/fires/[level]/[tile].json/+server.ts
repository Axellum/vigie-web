import { error, json } from '@sveltejs/kit';
import { fireLevelById, isTile } from '$lib/fires';
import { ApiError, cacheHeaders, getFires, TTL_S } from '$lib/server/vigie';
import type { RequestHandler } from './$types';

// One tile of the active fires of the world map: /data/fires/<level>/<x>_<y>.json ($lib/fires).
export const GET: RequestHandler = async ({ params }) => {
	const level = fireLevelById(params.level);
	const m = /^(\d{1,3})_(\d{1,3})$/.exec(params.tile);
	const [x, y] = m ? [Number(m[1]), Number(m[2])] : [-1, -1];
	if (!level || !isTile(level, x, y)) error(404, 'No such tile of fires');
	try {
		const { value, stale } = await getFires(level, x, y);
		return json({ ...value, stale: value.stale || stale }, { headers: cacheHeaders(TTL_S.fires) });
	} catch (e) {
		if (e instanceof ApiError && e.status === 404) error(404, 'The API of this site has no fire data');
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
