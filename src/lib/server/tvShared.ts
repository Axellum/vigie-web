// What the screen of a personal page reads for its blocks: the weather of each place, tide for tide cards,
// aurora for sky cards, and the cached site-wide warnings, hazards and surf overview when needed. Each answer comes from the
// site's own cache, so however many screens show the page, the API is asked once for a place and a kind of data. A reading
// that does not answer is left out and the panel says "no data"; only a failure that is not the API's (a bug) goes up.
import { countriesNear, type Borders } from '#lib/near.js';
import type { WarningsData } from '#lib/types.js';
import type { Fresh } from '#lib/tv/model.js';
import type { SharedPage, SharedPlace } from './pageLinks';
import type { Reading, SharedContext } from '#lib/tv/shared.js';
import { drawnBlocks } from '#lib/tv/shared.js';
import {
	ApiError,
	BudgetError,
	getHazards,
	getServed,
	getSurfOverview,
	getTides,
	getTvAurora,
	getTvPoint,
	getWarnings
} from './vigie';

export interface Readers {
	point: typeof getTvPoint;
	tide: typeof getTides;
	aurora?: typeof getTvAurora;
}

export interface ContextReaders {
	served: typeof getServed;
	warnings: typeof getWarnings;
	hazards: typeof getHazards;
	surf: typeof getSurfOverview;
	borders: () => Promise<Borders>;
}

const live: Readers = { point: getTvPoint, tide: getTides, aurora: getTvAurora };

let cachedBorders: Borders | null = null;
async function loadBorders(): Promise<Borders> {
	cachedBorders ??= (await import('#lib/data/borders.json')).default as unknown as Borders;
	return cachedBorders;
}

const liveContext: ContextReaders = {
	served: getServed,
	warnings: getWarnings,
	hazards: getHazards,
	surf: getSurfOverview,
	borders: loadBorders
};

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
	const auroras = new Map<
		string,
		ReturnType<typeof settled<NonNullable<Awaited<ReturnType<typeof getTvAurora>>>>>
	>();
	const auroraReader = readers.aurora ?? live.aurora!;
	for (const b of blocks) {
		const key = keyOf(b.place);
		// Every drawn block asks for the weather: it holds the time zone of the place, which the tide, surf and clock need.
		if (!points.has(key)) points.set(key, settled(readers.point(b.place.lat, b.place.lon)));
		if (b.type === 'tide' && !tides.has(key)) tides.set(key, settled(readers.tide(b.place.lat, b.place.lon)));
		if (b.type === 'sky' && !auroras.has(key))
			auroras.set(key, settled(auroraReader(b.place.lat, b.place.lon)));
	}
	const entries = await Promise.all(
		blocks.map(async (b): Promise<[string, Reading]> => {
			const key = keyOf(b.place);
			return [
				b.id,
				{
					point: (await points.get(key)) ?? null,
					tide: b.type === 'tide' ? ((await tides.get(key)) ?? null) : null,
					...(b.type === 'sky' ? { aurora: (await auroras.get(key)) ?? null } : {})
				}
			];
		})
	);
	return new Map(entries);
}

/** Shared site-wide readings (official warnings, hazards, surf spots) needed by the blocks of the screen. */
export async function readContext(
	page: SharedPage,
	readers: ContextReaders = liveContext
): Promise<SharedContext> {
	const blocks = drawnBlocks(page);
	const officialBlocks = blocks.filter((b) => b.type === 'official');
	const wantsHazards = blocks.some((b) => b.type === 'hazards');
	const wantsSurf = blocks.some((b) => b.type === 'surf');
	if (!officialBlocks.length && !wantsHazards && !wantsSurf) return {};

	const [servedRes, bordersRes, hazardsRes, surfRes] = await Promise.all([
		officialBlocks.length ? settled(readers.served()) : Promise.resolve(null),
		officialBlocks.length ? readers.borders() : Promise.resolve(null),
		wantsHazards ? settled(readers.hazards()) : Promise.resolve(null),
		wantsSurf ? settled(readers.surf()) : Promise.resolve(null)
	]);

	const served = servedRes ? servedRes.value.map((c) => c.country) : null;
	const warnings = new Map<string, Fresh<WarningsData> | null>();
	if (served && officialBlocks.length) {
		const codes = new Set<string>();
		for (const b of officialBlocks) {
			for (const cc of countriesNear(b.place, served)) codes.add(cc);
		}
		await Promise.all(
			[...codes].map(async (cc) => {
				const w = await settled(readers.warnings(cc));
				warnings.set(cc, w ? { value: w.value.data, fetchedAt: w.fetchedAt, stale: w.stale } : null);
			})
		);
	}

	return {
		served,
		warnings,
		borders: bordersRes,
		hazards: hazardsRes,
		surf: surfRes
	};
}
