import { error } from '@sveltejs/kit';
import { ApiError, getRadarNowcast, getRadarNowcastTile, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

const whole = (value: string): number => (/^\d{1,10}$/.test(value) ? Number(value) : -1);

// One Web Mercator PNG tile of the PIAF +1h rain nowcast:
// `/data/radar/france/nowcast/tiles/<epoch>/<z>/<x>/<y>.png?run=<run>` (the run of `/data/radar/france/nowcast`).
// Only epochs currently listed by `/v1/radar/france/nowcast` are relayed. The next run draws the same times again: a tile is
// immutable only when the API says it was drawn with the run of its address, otherwise kept a minute.
export const GET: RequestHandler = async ({ params, url }) => {
	const epoch = whole(params.epoch);
	const z = whole(params.z);
	const x = whole(params.x);
	const y = whole(params.y.replace(/\.png$/, ''));
	const asked = url.searchParams.get('run');
	const run = asked === null ? null : whole(asked);
	if (epoch < 0 || z < 0 || z > 12 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z || run === -1) {
		error(404, 'No such tile');
	}
	try {
		const nowcast = (await getRadarNowcast()).value;
		if (!nowcast?.frames.some((f) => f.epoch === epoch)) error(404, 'No such nowcast image');
		if (z < nowcast.minZoom || z > nowcast.maxZoom) error(404, 'Zoom out of range');
		const got = await getRadarNowcastTile(epoch, z, x, y, run);
		if (!got) error(404, 'No such tile');
		return new Response(got.tile as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': got.immutable
					? `public, max-age=${TTL_S.radarNowcastTile}, immutable`
					: `public, max-age=${TTL_S.radarNowcast}`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
