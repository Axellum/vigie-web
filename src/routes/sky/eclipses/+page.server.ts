import type { Eclipse } from '#lib/eclipse.js';
import { ApiError, getEclipseMap, getEclipses } from '#lib/server/vigie.js';
import type { FeatureCollection } from 'geojson';
import type { PageServerLoad } from './$types';

// NASA's eclipses of the next ten years, and the map of the one chosen (`?date=`, else the next one). The place is
// chosen in the browser and asked by the card.
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const now = Math.floor(Date.now() / 1000);
	let eclipses: Eclipse[] = [];
	let attribution: string | null = null;
	try {
		const list = (await getEclipses()).value;
		eclipses = list.eclipses;
		attribution = list.attribution;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	const asked = url.searchParams.get('date');
	const chosen =
		eclipses.find((e) => e.id === asked) ?? eclipses.find((e) => e.greatest > now - 6 * 3600) ?? null;
	let map: { features: FeatureCollection; attribution: string | null } | null = null;
	if (chosen) {
		try {
			map = (await getEclipseMap(chosen.id)).value;
		} catch (e) {
			if (!(e instanceof ApiError)) throw e;
		}
	}
	setHeaders({ 'cache-control': 'public, max-age=600, s-maxage=3600' });
	return { eclipses, attribution, chosen, map, now };
};
