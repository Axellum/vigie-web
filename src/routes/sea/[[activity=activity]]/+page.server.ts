import { activityOfSlug, type SeaOverview } from '#lib/sea/overview.js';
import { validRange } from '#lib/sea/choice.js';
import { ApiError, BudgetError, getActivitiesOverview } from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

// "Should you go?" for every spot, for one activity (`/sea/kite`) or, without one, for the one the visitor chose last (the
// page reads it in the browser). The verdicts are the same for everybody, so the page is kept by the proxy; a wind range of the
// kite in the address (`?min=15&max=30`, knots) is asked of the API as it is, within the limits of `getActivitiesOverview`.
export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
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
	setHeaders({
		'cache-control': overview ? 'public, max-age=300, s-maxage=600' : 'public, max-age=60, s-maxage=60'
	});
	return { activity, overview, asked: wanted, rangeDenied };
};
