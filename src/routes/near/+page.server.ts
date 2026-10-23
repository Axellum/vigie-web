import { ApiError, getHazards, getUncovered, servedCodes } from '$lib/server/vigie';
import type { Hazard, UncoveredCountry } from '$lib/types';
import type { PageServerLoad } from './$types';

// The page is the same for everybody: the place is chosen in the browser and never reaches this load.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let hazards: Hazard[] = [];
	let hazardsAttribution: string | null = null;
	let apiDown = false;
	try {
		const { value } = await getHazards();
		hazards = value.items;
		hazardsAttribution = value.attribution;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}
	const served = await servedCodes();
	// Why a country has no source, as the API says it (none when it cannot tell).
	let uncovered: UncoveredCountry[] = [];
	try {
		uncovered = (await getUncovered()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazards, hazardsAttribution, served, uncovered, apiDown, now: Math.floor(Date.now() / 1000) };
};
