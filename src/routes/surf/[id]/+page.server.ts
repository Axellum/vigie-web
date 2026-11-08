import { error } from '@sveltejs/kit';
import { buoyOf, type ActivitiesForecast, type SpotBuoy } from '#lib/activities.js';
import { ApiError, getActivities, getSurfBuoys, getSurfForecast } from '#lib/server/vigie.js';
import type { SurfForecast } from '#lib/surf.js';
import type { PageServerLoad } from './$types';

/** The answer of a call to the API, or undefined when the API did not answer (any other error goes up). */
async function settled<T>(call: Promise<T>): Promise<T | undefined> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError) return undefined;
		throw e;
	}
}

// The forecast of one spot for the next three days, as the API worked it out; 404 for a spot the API does not know.
// Beside it, the verdicts for surf, kite, boat and shore fishing and the nearest wave buoy: if the verdicts do not answer,
// the page keeps its forecast and says so, and is kept one minute only so that the next visit asks again.
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

	let verdicts: ActivitiesForecast | null = null;
	let buoy: SpotBuoy | null = null;
	let buoyAttribution: string | null = null;
	let buoyMaxKm: number | null = null;
	if (forecast) {
		// Only for a spot that exists: a made-up address costs the API one request, not three.
		const [activities, buoys] = await Promise.all([
			settled(getActivities(params.id)),
			settled(getSurfBuoys())
		]);
		verdicts = activities?.value ?? null;
		// A spot whose forecast the API gave but whose verdicts it did not is a failure of the verdicts, not a spot without any.
		if (!verdicts) failed = true;
		if (buoys) {
			buoy = buoyOf(buoys.value, params.id);
			buoyAttribution = buoys.value.attribution;
			buoyMaxKm = buoys.value.maxComparableKm;
		}
	}
	setHeaders({
		'cache-control': failed ? 'public, max-age=60, s-maxage=60' : 'public, max-age=300, s-maxage=600'
	});
	return { id: params.id, forecast, verdicts, buoy, buoyAttribution, buoyMaxKm };
};
