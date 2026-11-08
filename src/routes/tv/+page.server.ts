import { version } from '$app/env';
import { hourLabel, type SurfSpot } from '#lib/surf.js';
import { buildScreen, type TvScreen } from '#lib/tv/model.js';
import { parseTvParams, type TvParams } from '#lib/tv/params.js';
import { qrOf, type Qr } from '#lib/tv/qr.js';
import { publicOrigin } from '#lib/server/origin.js';
import {
	ApiError,
	BudgetError,
	getActivities,
	getSurfForecast,
	getSurfSpots,
	getTides,
	getTvPoint
} from '#lib/server/vigie.js';
import type { PageServerLoad } from './$types';

type Mode = 'screen' | 'choose' | 'unknown' | 'unavailable';

export interface TvPageData {
	mode: Mode;
	params: TvParams;
	build: string;
	screen: TvScreen | null;
	/** When the data were read, as a time of day. */
	freshLabel: string | null;
	qr: Qr | null;
	spots: { id: string; name: string; place: string | null }[];
}

/** The answer of a call to the API, or undefined when the API did not answer (any other error goes up). */
async function settled<T>(call: Promise<T>): Promise<T | undefined> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError || e instanceof BudgetError) return undefined;
		throw e;
	}
}

// The screen of one spot: its verdicts, its swell and wind, its tide and its sky, each from the cache of the site (one request to the
// API per spot and per kind of data, whatever the number of screens). A part that does not answer is left out and the screen says it;
// only when nothing at all answers does it say so for the whole screen. The answer is never kept by a cache: the clock is in it.
export const load: PageServerLoad = async ({ url, locals, setHeaders }): Promise<TvPageData> => {
	const params = parseTvParams(url.searchParams);
	const lang = locals.lang;
	setHeaders({ 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow' });
	const base = { params, build: version, screen: null, freshLabel: null, qr: null, spots: [] };

	if (!params.spot) {
		const spots = await settled(getSurfSpots());
		return {
			...base,
			mode: 'choose',
			spots: spots?.value.spots.map((s) => ({ id: s.id, name: s.name, place: s.place })) ?? []
		};
	}

	const [activities, forecast] = await Promise.all([
		settled(getActivities(params.spot)),
		settled(getSurfForecast(params.spot))
	]);
	// null is the API saying that it does not know the spot; undefined is the API not answering.
	if (activities === null || forecast === null) return { ...base, mode: 'unknown' };
	const spot: SurfSpot | undefined = activities?.value.spot ?? forecast?.value.spot;
	if (!spot) return { ...base, mode: 'unavailable' };

	const [tide, sky] = await Promise.all([
		settled(getTides(spot.lat, spot.lon)),
		settled(getTvPoint(spot.lat, spot.lon))
	]);
	const now = Math.floor(Date.now() / 1000);
	const screen = buildScreen({
		now,
		lang,
		params,
		spot,
		activities: activities ?? null,
		forecast: forecast ?? null,
		tide: tide ?? null,
		sky: sky ?? null
	});
	return {
		...base,
		mode: 'screen',
		screen,
		freshLabel: screen.fresh == null ? null : hourLabel(lang, screen.fresh),
		qr: qrOf(`${publicOrigin()}/surf/${spot.id}`)
	};
};
