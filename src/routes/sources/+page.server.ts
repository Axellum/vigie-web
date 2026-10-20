import { ApiError, getHazards, getProviders } from '$lib/server/vigie';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	let providers: { name: string; healthy: boolean | null }[] | null = null;
	let credits: string[] = [];
	try {
		providers = (await getProviders()).value.map((p) => ({
			name: String(p.name ?? '–'),
			healthy: typeof p.healthy === 'boolean' ? p.healthy : null
		}));
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	try {
		credits = ((await getHazards()).value.attribution ?? '').split(' | ').filter(Boolean);
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=60' });
	return { providers, credits };
};
