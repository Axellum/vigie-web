import { ApiError, getHazards } from '$lib/server/vigie';
import type { Hazard } from '$lib/types';
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
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazards, hazardsAttribution, apiDown, now: Math.floor(Date.now() / 1000) };
};
