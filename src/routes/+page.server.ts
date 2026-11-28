import { ApiError, eventsNow, getHazards, getUncovered, servedCodes } from '#lib/server/vigie.js';
import type { HazardsData, UncoveredCountry } from '#lib/types.js';
import type { PageServerLoad } from './$types';

// The hazards are rendered on the server (they are the same for everybody); the warnings of the
// countries in view are loaded by the browser as the map moves.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let hazards: HazardsData | null = null;
	let stale = false;
	// Both are asked together; a failure of the hazards leaves the page without them, a failure of the list of countries goes up.
	// Why a country has no source, as the API says it: the cards of "here" tell it (none when the API cannot tell).
	const [result, served, uncoveredResult] = await Promise.all([
		getHazards().catch(() => null),
		servedCodes(),
		getUncovered().catch((e: unknown) => {
			if (!(e instanceof ApiError)) throw e;
			return null;
		})
	]);
	const uncovered: UncoveredCountry[] = uncoveredResult?.value ?? [];
	if (result) {
		hazards = result.value;
		stale = result.stale;
	}
	// The world in events as last read (null before the first reading: the page then asks for it itself).
	const events = eventsNow();
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return {
		hazards,
		served,
		uncovered,
		stale,
		events: events?.value ?? null,
		now: Math.floor(Date.now() / 1000)
	};
};
