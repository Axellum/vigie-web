import { error } from '@sveltejs/kit';
import { radarAreaFrom } from '#lib/radar.js';
import { radarTileResponse } from '#lib/server/radarTile.js';
import type { RequestHandler } from './$types';

// One tile of an image of the rain radar of an area: /data/radar/<area>/<epoch>/<z>/<x>/<y>.png (`france`, `antilles`, `reunion`,
// `new-caledonia`).
export const GET: RequestHandler = ({ params }) => {
	const area = radarAreaFrom(params.area);
	if (!area) error(404, 'No such radar area');
	return radarTileResponse(area, params);
};
