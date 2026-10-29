import { ApiError, getSurfOverview, getSurfSpots } from '#lib/server/vigie.js';
import type { SurfOverview, SurfSpots } from '#lib/surf.js';
import type { PageServerLoad } from './$types';

// Every spot in short (the API's overview: its current hour and best slot), the same for everybody; without it, the plain
// list of the spots. The page picks the spots near a place in the browser.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let overview: SurfOverview | null = null;
	let spots: SurfSpots | null = null;
	try {
		const read = await getSurfOverview();
		overview = { ...read.value, stale: read.value.stale || read.stale };
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	if (!overview) {
		try {
			spots = (await getSurfSpots()).value;
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
		}
	}
	setHeaders({
		'cache-control':
			overview || spots ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60, s-maxage=60'
	});
	return { overview, spots };
};
