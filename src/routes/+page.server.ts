import { getHazards, servedCodes } from '#lib/server/vigie.js';
import type { HazardsData } from '#lib/types.js';
import type { PageServerLoad } from './$types';

// The hazards are rendered on the server (they are the same for everybody); the warnings of the
// countries in view are loaded by the browser as the map moves.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let hazards: HazardsData | null = null;
	let stale = false;
	try {
		const result = await getHazards();
		hazards = result.value;
		stale = result.stale;
	} catch {
		hazards = null;
	}
	const served = await servedCodes();
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazards, served, stale, now: Math.floor(Date.now() / 1000) };
};
