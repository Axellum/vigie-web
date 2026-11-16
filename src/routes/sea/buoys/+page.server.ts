import type { SeaBuoys } from '#lib/sea/buoys.js';
import { ApiError, getSeaBuoys } from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

// The offshore buoys of Météo-France: the same answer for everybody, read by the server (the page works without a script) and
// kept by the proxy for a few minutes; a record comes once an hour.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let answer: SeaBuoys | null = null;
	let stale = false;
	try {
		const read = await getSeaBuoys();
		answer = read.value;
		stale = read.stale || read.value.stale;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	setHeaders({
		'cache-control':
			answer?.status === 'ok' ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60, s-maxage=60'
	});
	return { answer, stale };
};
