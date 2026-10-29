import { error } from '@sveltejs/kit';
import { ApiError, getSurfForecast } from '#lib/server/vigie.js';
import type { SurfForecast } from '#lib/surf.js';
import type { PageServerLoad } from './$types';

// The forecast of one spot for the next three days, as the API worked it out; 404 for a spot the API does not know.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	let forecast: SurfForecast | null = null;
	let failed = false;
	try {
		const cached = await getSurfForecast(params.id);
		if (!cached) error(404, 'No such surf spot');
		forecast = cached.value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		failed = true;
	}
	setHeaders({
		'cache-control': failed ? 'public, max-age=60, s-maxage=60' : 'public, max-age=300, s-maxage=600'
	});
	return { id: params.id, forecast };
};
