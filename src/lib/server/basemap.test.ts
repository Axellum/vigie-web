import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inlineTiles } from './basemap';

const HOST = 'https://tiles.openfreemap.org';
const TILES = `${HOST}/planet/20261122_124456_pt/{z}/{x}/{y}.pbf`;
const description = {
	tilejson: '3.0.0',
	tiles: [TILES],
	minzoom: 0,
	maxzoom: 14,
	bounds: [-180, -85.05113, 180, 85.05113],
	attribution: '© OpenMapTiles, OpenStreetMap',
	vector_layers: [{ id: 'water' }],
	name: 'OpenFreeMap'
};
const style = () => ({
	version: 8,
	sprite: `${HOST}/sprites/ofm_f384/ofm`,
	glyphs: `${HOST}/fonts/{fontstack}/{range}.pbf`,
	sources: {
		ne2_shaded: {
			type: 'raster',
			tileSize: 256,
			maxzoom: 6,
			tiles: [`${HOST}/natural_earth/ne2sr/{z}/{x}/{y}.png`]
		},
		openmaptiles: { type: 'vector', url: `${HOST}/planet` }
	},
	layers: [{ id: 'background', type: 'background' }]
});

describe('inlineTiles', () => {
	it('gives a source the tiles of its description, and keeps the rest of the style', async () => {
		const read = vi.fn(async () => description);
		const out = await inlineTiles(style(), read);
		expect(read).toHaveBeenCalledExactlyOnceWith(`${HOST}/planet`);
		expect(out.sources).toEqual({
			ne2_shaded: style().sources.ne2_shaded,
			openmaptiles: {
				type: 'vector',
				tiles: [TILES],
				minzoom: 0,
				maxzoom: 14,
				bounds: description.bounds,
				attribution: description.attribution
			}
		});
		const { sources: _a, ...rest } = out;
		const { sources: _b, ...before } = style();
		expect(rest).toEqual(before);
	});

	it("keeps a source's own fields over its description's, as MapLibre does", async () => {
		const own = style();
		Object.assign(own.sources.openmaptiles, { maxzoom: 12, attribution: 'ours' });
		const out = await inlineTiles(own, async () => description);
		expect(out.sources).toMatchObject({ openmaptiles: { maxzoom: 12, attribution: 'ours', tiles: [TILES] } });
	});

	it('refuses tiles that are not on OpenFreeMap, or none', async () => {
		for (const tiles of [
			['https://elsewhere.example/{z}/{x}/{y}.pbf'],
			[],
			undefined,
			['/planet/{z}/{x}/{y}.pbf']
		]) {
			await expect(inlineTiles(style(), async () => ({ ...description, tiles }))).rejects.toThrow(/not on/);
		}
	});

	it('leaves alone a source that names a description elsewhere', async () => {
		const other = style();
		Object.assign(other.sources.openmaptiles, { url: 'https://elsewhere.example/planet' });
		const read = vi.fn(async () => description);
		const out = await inlineTiles(other, read);
		expect(read).not.toHaveBeenCalled();
		expect(out.sources).toMatchObject({ openmaptiles: { url: 'https://elsewhere.example/planet' } });
	});
});

describe('the style served by the site', () => {
	let fetches: string[];
	let down: boolean;

	beforeEach(() => {
		vi.resetModules();
		fetches = [];
		down = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				const url = String(input);
				fetches.push(url);
				if (down) throw new TypeError('fetch failed');
				const body = url.endsWith('/planet') ? description : style();
				return new Response(JSON.stringify(body), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			})
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('asks OpenFreeMap for the style and its description once per theme for 15 minutes', async () => {
		vi.useFakeTimers();
		const { getBasemapStyle } = await import('./basemap');
		const first = await getBasemapStyle('light');
		await getBasemapStyle('light');
		expect(fetches).toEqual([`${HOST}/styles/positron`, `${HOST}/planet`]);
		expect(first.value.sources).toMatchObject({ openmaptiles: { tiles: [TILES] } });
		await getBasemapStyle('dark');
		expect(fetches.slice(2)).toEqual([`${HOST}/styles/dark`, `${HOST}/planet`]);
		vi.advanceTimersByTime(15 * 60_000 + 1);
		await getBasemapStyle('light');
		expect(fetches).toHaveLength(6);
	});

	it('serves the last style while OpenFreeMap is down', async () => {
		vi.useFakeTimers();
		const { getBasemapStyle } = await import('./basemap');
		const good = await getBasemapStyle('light');
		down = true;
		vi.advanceTimersByTime(15 * 60_000 + 1);
		const again = await getBasemapStyle('light');
		expect(again.stale).toBe(true);
		expect(again.value).toEqual(good.value);
	});

	it('sends the map to OpenFreeMap when the site has no style to give', async () => {
		down = true;
		const { GET } = await import('../../routes/data/basemap/[theme].json/+server');
		const call = (theme: string) => GET({ params: { theme } } as Parameters<typeof GET>[0]);
		await expect(call('dark')).rejects.toMatchObject({ status: 302, location: `${HOST}/styles/dark` });
		await expect(call('toString')).rejects.toMatchObject({ status: 404 });
	});

	it('answers the style with the tiles in it, kept 10 minutes by a browser', async () => {
		const { GET } = await import('../../routes/data/basemap/[theme].json/+server');
		const response = await GET({ params: { theme: 'light' } } as Parameters<typeof GET>[0]);
		expect(response.headers.get('cache-control')).toBe('public, max-age=600');
		const body = await response.json();
		expect(body.sources.openmaptiles).toMatchObject({ tiles: [TILES] });
		expect(body.sources.openmaptiles.url).toBeUndefined();
	});
});
