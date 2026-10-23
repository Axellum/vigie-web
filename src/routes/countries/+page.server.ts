import { ApiError, getServed, getUncovered } from '$lib/server/vigie';
import type { ServedCountry, UncoveredCountry } from '$lib/types';
import type { PageServerLoad } from './$types';

// The list is the API's answer: the countries its settings serve, then the others and why (when it says).
export const load: PageServerLoad = async ({ setHeaders }) => {
	let served: ServedCountry[] = [];
	let uncovered: UncoveredCountry[] = [];
	let apiDown = false;
	try {
		served = (await getServed()).value;
		uncovered = (await getUncovered()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}
	setHeaders({ 'cache-control': 'public, max-age=300, s-maxage=600' });
	return { served, uncovered, apiDown };
};
