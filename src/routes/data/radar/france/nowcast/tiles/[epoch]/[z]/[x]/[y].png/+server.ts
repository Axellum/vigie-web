import { error } from '@sveltejs/kit';
import { ApiError, getRadarNowcast, getRadarNowcastTile, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

const whole = (value: string): number => (/^\d{1,10}$/.test(value) ? Number(value) : -1);

// One Web Mercator PNG tile of the PIAF +1h rain nowcast:
// `/data/radar/france/nowcast/tiles/<epoch>/<z>/<x>/<y>.png`.
// Only epochs currently listed by `/v1/radar/france/nowcast` are relayed.
export const GET: RequestHandler = async ({ params }) => {
	const epoch = whole(params.epoch);
	const z = whole(params.z);
	const x = whole(params.x);
	const y = whole(params.y.replace(/\.png$/, ''));
	if (epoch < 0 || z < 0 || z > 12 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
		error(404, 'No such tile');
	}
	try {
		const nowcast = (await getRadarNowcast()).value;
		if (!nowcast?.frames.some((f) => f.epoch === epoch)) error(404, 'No such nowcast image');
		if (z < nowcast.minZoom || z > nowcast.maxZoom) error(404, 'Zoom out of range');
		const tile = await getRadarNowcastTile(epoch, z, x, y);
		if (!tile) error(404, 'No such tile');
		return new Response(tile as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': `public, max-age=${TTL_S.radarNowcastTile}, immutable`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
