import { ApiError, getTravel, getTravelHealth } from '#lib/server/vigie.js';
import { travelRows, type Health, type Ministry, type TravelRow } from '#lib/travel.js';
import type { PageServerLoad } from './$types';

export type { TravelRow };

// The same page for everybody. The overview of the API (every advice of every country) is reduced here to what the map
// and the list show, so that the page stays light.
export const load: PageServerLoad = async ({ setHeaders }) => {
	let ministries: Ministry[] = [];
	let rows: TravelRow[] = [];
	let attribution: string | null = null;
	let generated: number | null = null;
	let apiDown = false;
	try {
		const overview = (await getTravel()).value;
		ministries = overview.ministries;
		attribution = overview.attribution;
		generated = overview.generated || null;
		rows = travelRows(overview);
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		apiDown = true;
	}

	let health: Health | null = null;
	try {
		health = (await getTravelHealth()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}

	setHeaders({ 'cache-control': 'public, max-age=300, s-maxage=600' });
	return { ministries, rows, attribution, generated, apiDown, health };
};
