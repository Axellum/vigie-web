import { eventsNow, getHazards, servedCodes } from '#lib/server/vigie.js';
import type { HazardsData } from '#lib/types.js';
import type { PageServerLoad } from './$types';

// The hazards are rendered on the server (they are the same for everybody); the warnings of the
// countries in view are loaded by the browser as the map moves.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let hazards: HazardsData | null = null;
	let stale = false;
	// Both are asked together; a failure of the hazards leaves the page without them, a failure of the list of countries goes up.
	const [result, served] = await Promise.all([getHazards().catch(() => null), servedCodes()]);
	if (result) {
		hazards = result.value;
		stale = result.stale;
	}
	// The world in events as last read (null before the first reading: the page then asks for it itself).
	const events = eventsNow();
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazards, served, stale, events: events?.value ?? null, now: Math.floor(Date.now() / 1000) };
};
