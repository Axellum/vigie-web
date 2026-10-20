import { error } from '@sveltejs/kit';
import { ApiError, getWarnings } from '$lib/server/vigie';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const cc = params.cc.toUpperCase();
	let result;
	try {
		result = await getWarnings(cc);
	} catch (e) {
		if (e instanceof ApiError) error(502, 'The Vigie API does not answer for now');
		throw e;
	}
	if (!result) error(404, 'No source of official warnings for this country');
	const detail = result.value.details.get(params.id);
	if (!detail) error(404, 'This warning is not in force any more, or never was');
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=120' });
	return { detail, stale: result.stale, now: Math.floor(Date.now() / 1000) };
};
