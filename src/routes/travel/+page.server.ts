import { ApiError, getTravel, getTravelHealth } from '#lib/server/vigie.js';
import { mapLevel, wholeCountry, type Health, type Ministry } from '#lib/travel.js';
import type { Level } from '#lib/types.js';
import type { PageServerLoad } from './$types';

/** One country of the page: the colour of each ministry's advice for the whole country (Vigie's), and the comparison. */
export interface TravelRow {
	cc: string;
	marks: Record<string, Level | null>;
	disagree: boolean | null;
	gap: number | null;
}

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
		const read = ministries.filter((m) => m.read).map((m) => m.id);
		rows = overview.countries.map((c) => ({
			cc: c.country,
			marks: Object.fromEntries(
				read.map((id) => {
					const advice = wholeCountry(c.advices, id);
					return [id, advice ? mapLevel(advice) : null];
				})
			),
			disagree: c.comparison.disagree,
			gap: c.comparison.gap
		}));
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
