import { ApiError, getSurfSpots } from '#lib/server/vigie.js';
import type { SurfSpots } from '#lib/surf.js';
import type { PageServerLoad } from './$types';

// The spots of the API, the same for everybody; each links to its forecast.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let spots: SurfSpots | null = null;
	try {
		spots = (await getSurfSpots()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	setHeaders({
		'cache-control': spots ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=60, s-maxage=60'
	});
	return { spots };
};
