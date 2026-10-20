import { error } from '@sveltejs/kit';
import { countryBox, pointInBox } from '$lib/geo';
import { ApiError, getHazards, getWarnings, isServed } from '$lib/server/vigie';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const cc = params.cc.toUpperCase();
	if (!(await isServed(cc))) error(404, 'No source of official warnings for this country');
	const box = countryBox(cc);

	let warnings = null;
	let stale = false;
	let fetchedAt: number | null = null;
	let apiDown = false;
	try {
		const result = await getWarnings(cc);
		if (result) {
			const { shapes: _shapes, ...rest } = result.value.data;
			warnings = rest;
			stale = result.stale;
			fetchedAt = Math.floor(result.fetchedAt / 1000);
		}
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}

	let hazards: Awaited<ReturnType<typeof getHazards>>['value']['items'] = [];
	try {
		const all = (await getHazards()).value.items;
		hazards = box ? all.filter((h) => pointInBox(box, h.lon, h.lat)) : [];
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}

	setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=120' });
	return { cc, box, warnings, stale, fetchedAt, apiDown, hazards, now: Math.floor(Date.now() / 1000) };
};
