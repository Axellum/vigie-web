import { error } from '@sveltejs/kit';
import { ApiError, getHazards } from '$lib/server/vigie';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	let items;
	try {
		items = (await getHazards()).value.items;
	} catch (e) {
		if (e instanceof ApiError) error(502, 'The Vigie API does not answer for now');
		throw e;
	}
	const hazard = items.find((h) => h.id === params.id);
	if (!hazard) error(404, 'This alert is not in the current list any more');
	setHeaders({ 'cache-control': 'public, max-age=30, s-maxage=60' });
	return { hazard, now: Math.floor(Date.now() / 1000) };
};
