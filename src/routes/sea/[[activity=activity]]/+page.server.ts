import { activityOfSlug, type SeaOverview } from '#lib/sea/overview.js';
import { validRange } from '#lib/sea/choice.js';
import { ApiError, BudgetError, getActivitiesOverview, getSurfOverview } from '#lib/server/vigie.js';
import type { SurfSpotNow } from '#lib/surf.js';
import type { PageServerLoad } from './$types';

// "Should you go?" for every spot, for one activity (`/sea/kite`) or, without one, for the one the visitor chose last (the
// page reads it in the browser). The verdicts are the same for everybody, so the page is kept by the proxy; a wind range of the
// kite in the address (`?min=15&max=30`, knots) is asked of the API as it is, within the limits of `getActivitiesOverview`.
// Beside them, the surf overview gives the figures of the current hour that the pins of the map show (swell, wind, tide), read
// from the same cache as the surf page; without it the map keeps its verdicts.
export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const surfRead = getSurfOverview().then(
		(read): SurfSpotNow[] => read.value.spots,
		(e): null => {
			if (e instanceof ApiError) return null;
			throw e;
		}
	);
	const activity = params.activity ? activityOfSlug(params.activity) : null;
	const wanted =
		url.searchParams.has('min') || url.searchParams.has('max')
			? validRange(Number(url.searchParams.get('min')), Number(url.searchParams.get('max')))
			: null;

	let overview: SeaOverview | null = null;
	let rangeDenied = false;
	try {
		const read = await getActivitiesOverview(wanted);
		overview = { ...read.value, stale: read.value.stale || read.stale };
	} catch (e) {
		if (!(e instanceof ApiError || e instanceof BudgetError)) throw e;
		if (e instanceof BudgetError) rangeDenied = true;
	}
	// The range could not be asked for (the day's share is used up): the default one, said on the page.
	if (!overview && rangeDenied) {
		try {
			const read = await getActivitiesOverview(null);
			overview = { ...read.value, stale: read.value.stale || read.stale };
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
		}
	}
	const surf = await surfRead;
	setHeaders({
		'cache-control': overview ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60, s-maxage=60'
	});
	return { activity, overview, surf, asked: wanted, rangeDenied };
};
