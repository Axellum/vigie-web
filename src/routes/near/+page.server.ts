import { placeContext } from '#lib/server/placeContext.js';
import type { PageServerLoad } from './$types';

// The page is the same for everybody: the place is chosen in the browser and never reaches this load.
export const load: PageServerLoad = async ({ setHeaders }) => {
	const context = await placeContext();
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return context;
};
