import { radarTileResponse } from '#lib/server/radarTile.js';
import type { RequestHandler } from './$types';

// The first address of the radar's tiles, France's: /data/radar/<epoch>/<z>/<x>/<y>.png (the other areas have `/data/radar/<area>/...`).
export const GET: RequestHandler = ({ params }) => radarTileResponse('france', params);
