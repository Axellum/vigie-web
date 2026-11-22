import { error } from '@sveltejs/kit';
import { OBSERVED_RAIN_STAMP } from '#lib/observedRain.js';
import { ApiError, getObservedRain, getObservedRainTile, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

const whole = (value: string): number => (/^\d{1,10}$/.test(value) ? Number(value) : -1);

// One Web Mercator PNG tile of the global observed satellite precipitation layer:
// `/data/rain-observed/tiles/<stamp>/<z>/<x>/<y>.png`.
// Only stamps currently listed by `/v1/rain/observed` and zooms within its range are relayed.
export const GET: RequestHandler = async ({ params }) => {
	const stamp = params.stamp;
	const z = whole(params.z);
	const x = whole(params.x);
	const y = whole(params.y.replace(/\.png$/, ''));
	if (!OBSERVED_RAIN_STAMP.test(stamp) || z < 0 || z > 12 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
		error(404, 'No such tile');
	}
	try {
		const observed = (await getObservedRain()).value;
		if (!observed || observed.status !== 'ok') error(404, 'No such observed rain image');
		if (!observed.frames.some((f) => f.stamp === stamp)) error(404, 'No such observed rain image');
		if (z < observed.minZoom || z > observed.maxZoom) error(404, 'Zoom out of range');
		const tile = (await getObservedRainTile(stamp, z, x, y)).value;
		if (!tile) error(404, 'No such tile');
		return new Response(tile as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': `public, max-age=${TTL_S.observedRainTile}, immutable`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(e.status === 503 ? 503 : 502, e.message);
		throw e;
	}
};
