import { error } from '@sveltejs/kit';
import { ApiError, getRadar, getRadarTile, TTL_S } from '#lib/server/vigie.js';
import type { RadarArea } from '#lib/radar.js';

// One tile of an image of the rain radar, for `/data/radar/<area>/<epoch>/<z>/<x>/<y>.png` and the first address of the site's radar,
// `/data/radar/<epoch>/<z>/<x>/<y>.png` (France). Only the images the API lists are relayed, so that the number of distinct tiles a
// visitor can ask for stays small. A tile of an image never changes: kept a day by browsers.
const whole = (value: string): number => (/^\d{1,10}$/.test(value) ? Number(value) : -1);

export async function radarTileResponse(
	area: RadarArea,
	params: { epoch: string; z: string; x: string; y: string }
): Promise<Response> {
	const epoch = whole(params.epoch);
	const z = whole(params.z);
	const x = whole(params.x);
	const y = whole(params.y.replace(/\.png$/, ''));
	if (epoch < 0 || z < 0 || z > 12 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z)
		error(404, 'No such tile');
	try {
		const radar = (await getRadar(area)).value;
		if (!radar?.frames.includes(epoch)) error(404, 'No such image');
		const tile = await getRadarTile(area, epoch, z, x, y);
		if (!tile) error(404, 'No such tile');
		return new Response(tile as BodyInit, {
			headers: {
				'content-type': 'image/png',
				'cache-control': `public, max-age=${TTL_S.radarTile}, immutable`
			}
		});
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
}
