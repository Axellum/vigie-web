import { error } from '@sveltejs/kit';
import type { SeaOverview } from '#lib/sea/overview.js';
import {
	groupByType,
	isPlaceId,
	NEARBY_KM,
	type SeaPlaceAnswer,
	type SeaPlaceList
} from '#lib/sea/places.js';
import {
	ApiError,
	BudgetError,
	getActivitiesOverview,
	getSeaPlace,
	getSeaPlaces
} from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

const PER_TYPE = 4;

/** The answer of a call, or undefined when the API did not answer (any other error goes up). */
async function settled<T>(call: Promise<T>): Promise<T | undefined> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError || e instanceof BudgetError) return undefined;
		throw e;
	}
}

// One place of the catalogue: what it is (the API's), the verdicts of the surf spots around it (the shared overview, which asks no
// provider of its own), and the other places near it. A made-up address is a 404 without a request; a place the API does not know
// is a 404 too. If the overview or the neighbours do not answer, the page keeps what it has and says so, and is kept one minute
// only so that the next visit asks again.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!isPlaceId(params.id)) error(404, 'No such place');
	let found;
	try {
		found = await getSeaPlace(params.id);
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		error(503, 'The catalogue of places does not answer');
	}
	if (!found) error(404, 'No such place');
	const answer: SeaPlaceAnswer = found.value;
	const at = { lat: answer.place.lat, lon: answer.place.lon };

	const [overview, rare, common] = await Promise.all([
		settled(getActivitiesOverview(null)),
		settled(
			getSeaPlaces({
				types: ['port', 'anchorage', 'dive'],
				near: { ...at, radiusKm: NEARBY_KM.rare },
				limit: 13
			})
		),
		settled(
			getSeaPlaces({ types: ['slipway', 'bathing'], near: { ...at, radiusKm: NEARBY_KM.common }, limit: 13 })
		)
	]);
	const lists: SeaPlaceList[] = [rare?.value, common?.value].filter((l): l is SeaPlaceList => l != null);
	const seaOverview: SeaOverview | null = overview
		? { ...overview.value, stale: overview.value.stale || overview.stale }
		: null;
	const failed = !seaOverview || lists.length < 2;
	setHeaders({
		'cache-control': failed ? 'public, max-age=60, s-maxage=60' : 'public, max-age=300, s-maxage=600'
	});
	return {
		id: params.id,
		place: answer.place,
		built: answer.built,
		licence: answer.licence,
		attribution: answer.attribution,
		overview: seaOverview,
		groups: groupByType(
			lists.flatMap((l) => l.places),
			PER_TYPE,
			answer.place.id
		),
		nearbyFailed: lists.length < 2,
		// Attribution of what the neighbours came from: the sources of the page of a place may differ from its neighbours'.
		nearbyAttribution: lists.map((l) => l.attribution)
	};
};
