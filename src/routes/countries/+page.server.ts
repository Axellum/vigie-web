import { ApiError, getServed } from '$lib/server/vigie';
import type { ServedCountry } from '$lib/types';
import type { PageServerLoad } from './$types';

// The list is the API's answer: the countries its settings serve, not every country it has a border for.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let served: ServedCountry[] = [];
	let apiDown = false;
	try {
		served = (await getServed()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}
	setHeaders({ 'cache-control': 'public, max-age=300, s-maxage=600' });
	return { served, apiDown };
};
