import { error } from '@sveltejs/kit';
import { countryBox, isCovered } from '$lib/geo';
import { ApiError, getWarnings } from '$lib/server/vigie';
import { slug } from '$lib/transform';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const cc = params.cc.toUpperCase();
	if (!/^[A-Z]{2}$/.test(cc) || !isCovered(cc)) error(404, 'No source of official warnings for this country');
	let result;
	try {
		result = await getWarnings(cc);
	} catch (e) {
		if (e instanceof ApiError) error(502, 'The Vigie API does not answer for now');
		throw e;
	}
	const all = result?.value.data.warnings ?? [];
	const warnings = all.filter((w) => w.area && slug(w.area) === params.area);
	// An area with no warning in force any more is still a valid page: it says so.
	const area = warnings[0]?.area ?? params.area.replace(/-/g, ' ');
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=120' });
	return { cc, area, warnings, box: countryBox(cc), now: Math.floor(Date.now() / 1000) };
};
