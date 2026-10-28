import { ApiError, getAurora, getAuroraOval } from '#lib/server/vigie.js';
import type { Aurora } from '#lib/sky.js';
import type { FeatureCollection } from 'geojson';
import type { PageServerLoad } from './$types';

// The page is the same for everybody: NOAA's data and its oval. A place is chosen in the browser and asked by the card.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let aurora: Aurora | null = null;
	let oval: { features: FeatureCollection; forecast: number | null; attribution: string | null } | null =
		null;
	try {
		aurora = (await getAurora()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	try {
		oval = (await getAuroraOval()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=120' });
	return { aurora, oval, now: Math.floor(Date.now() / 1000) };
};
