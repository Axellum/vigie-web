// What the screen of a personal page reads for its blocks: the weather of each place (for the clock, the day and the night, and the
// cards of the weather, the sea and the air) and, for a tide card, the tide. Each answer comes from the site's own cache, so
// however many screens show the page, the API is asked once for a place and a kind of data. A reading that does not answer is left
// out and the panel says "no data"; only a failure that is not the API's (a bug) goes up.
import type { SharedPage, SharedPlace } from './pageLinks';
import type { Reading } from '#lib/tv/shared.js';
import { drawnBlocks } from '#lib/tv/shared.js';
import { ApiError, BudgetError, getTides, getTvPoint } from './vigie';

export interface Readers {
	point: typeof getTvPoint;
	tide: typeof getTides;
}

const live: Readers = { point: getTvPoint, tide: getTides };

/** The answer of a call to the API, or null when the API did not answer (any other error goes up). */
async function settled<T>(call: Promise<T | null>): Promise<T | null> {
	try {
		return await call;
	} catch (e) {
		if (e instanceof ApiError || e instanceof BudgetError) return null;
		throw e;
	}
}

const keyOf = (p: SharedPlace) => `${p.lat},${p.lon}`;

/** The readings for the blocks a screen draws, by block id. Two blocks of the same place share their readings. */
export async function readBlocks(page: SharedPage, readers: Readers = live): Promise<Map<string, Reading>> {
	const blocks = drawnBlocks(page);
	const points = new Map<string, ReturnType<typeof settled<Awaited<ReturnType<Readers['point']>>>>>();
	const tides = new Map<
		string,
		ReturnType<typeof settled<NonNullable<Awaited<ReturnType<Readers['tide']>>>>>
	>();
	for (const b of blocks) {
		const key = keyOf(b.place);
		// Every drawn block asks for the weather: it holds the time zone of the place, which the tide and the clock need.
		if (!points.has(key)) points.set(key, settled(readers.point(b.place.lat, b.place.lon)));
		if (b.type === 'tide' && !tides.has(key)) tides.set(key, settled(readers.tide(b.place.lat, b.place.lon)));
	}
	const entries = await Promise.all(
		blocks.map(async (b): Promise<[string, Reading]> => {
			const key = keyOf(b.place);
			return [
				b.id,
				{
					point: (await points.get(key)) ?? null,
					tide: b.type === 'tide' ? ((await tides.get(key)) ?? null) : null
				}
			];
		})
	);
	return new Map(entries);
}
