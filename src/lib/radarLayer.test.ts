import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadarLayer } from './radarLayer.svelte';

// The site's route gives the card the images in the form of `Radar` (radar.ts). The card follows the area the map is on:
// it asks the site for that area's images, appends optional PIAF +1h nowcast frames on France, shows only those, and drops
// them when the map moves to another area.
const list = (area: string) => ({
	status: 'ok',
	frames: [1_794_995_100, 1_794_995_400],
	intervalMinutes: 5,
	bounds: [-66, 10.59, -57, 21],
	minZoom: 3,
	maxZoom: 10,
	legend: [{ minMmH: 0.1, color: '#a6cee3', alpha: 0.67 }],
	attribution: `Source: Météo-France (${area})`
});

const nowcastBody = {
	runUtc: 1_794_995_400,
	frames: [
		{ epoch: 1_794_995_700, leadMinutes: 5 },
		{ epoch: 1_794_996_000, leadMinutes: 10 }
	],
	intervalMinutes: 5,
	bounds: [-6, 41, 10.5, 51.5],
	minZoom: 3,
	maxZoom: 10,
	legend: [{ minMmH: 0.1, color: '#a6cee3', alpha: 0.67 }],
	attribution: 'Source: Météo-France PIAF',
	note: null
};

const FRANCE: [number, number, number, number] = [-5.5, 41.2, 9.8, 51.3];
const MARTINIQUE: [number, number, number, number] = [-62.5, 14, -60.5, 16.5];

function stubFetch(withNowcast = true) {
	const asked: string[] = [];
	vi.stubGlobal('fetch', async (address: string) => {
		asked.push(address);
		if (address === '/data/radar/france/nowcast') {
			return withNowcast
				? new Response(JSON.stringify(nowcastBody), { status: 200 })
				: new Response('not found', { status: 404 });
		}
		const area = new URL(address, 'http://site').searchParams.get('area') ?? '';
		return new Response(JSON.stringify(list(area)), { status: 200 });
	});
	return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe('RadarLayer', () => {
	it('asks the images of an overseas area without asking France nowcast', async () => {
		const asked = stubFetch();
		const layer = new RadarLayer();
		layer.move(MARTINIQUE, 7);
		expect(layer.area).toBe('antilles');
		layer.sync();
		await vi.waitFor(() => expect(layer.status).toBe('ok'));
		expect(asked).toEqual(['/data/radar.json?area=antilles']);
		expect(layer.shown).toBe(true);
		expect(layer.hasNowcast).toBe(false);
		expect(layer.onMap('credit')?.frames[0].tiles).toBe('/data/radar/antilles/1794995100/{z}/{x}/{y}.png');
	});

	it('appends PIAF nowcast frames on France while defaulting to the latest observed frame', async () => {
		const asked = stubFetch(true);
		const layer = new RadarLayer();
		layer.move(MARTINIQUE, 7);
		layer.sync();
		await vi.waitFor(() => expect(layer.data?.attribution).toContain('antilles'));

		layer.move(FRANCE, 5);
		expect(layer.area).toBe('france');
		expect(layer.data).toBeNull();
		expect(layer.onMap('credit')).toBeNull();
		layer.sync();
		await vi.waitFor(() => expect(layer.data?.attribution).toContain('france'));
		expect(layer.hasNowcast).toBe(true);
		expect(layer.timeline).toHaveLength(4);
		// Default frame stays the newest observed frame (index 1), not the +10 min forecast.
		expect(layer.index).toBe(1);
		expect(layer.activeFrame?.kind).toBe('observed');
		expect(layer.onMap('credit')?.frames[0].tiles).toBe('/data/radar/france/1794995100/{z}/{x}/{y}.png');
		expect(layer.onMap('credit')?.frames[2].tiles).toBe(
			'/data/radar/france/nowcast/tiles/1794995700/{z}/{x}/{y}.png?run=1794995400'
		);
		expect(asked).toEqual([
			'/data/radar.json?area=antilles',
			'/data/radar.json?area=france',
			'/data/radar/france/nowcast'
		]);
	});

	it('falls back cleanly to observed radar when PIAF nowcast is unavailable', async () => {
		stubFetch(false);
		const layer = new RadarLayer();
		layer.move(FRANCE, 5);
		layer.sync();
		await vi.waitFor(() => expect(layer.status).toBe('ok'));
		expect(layer.hasNowcast).toBe(false);
		expect(layer.timeline).toHaveLength(2);
		expect(layer.index).toBe(1);
	});

	it('shows nothing and asks nothing where the radar has no mosaic', () => {
		const asked = stubFetch();
		const layer = new RadarLayer();
		layer.move([-52.5, 4.5, -52, 5.2], 9); // Cayenne
		layer.sync();
		expect(layer.area).toBeNull();
		expect(layer.shown).toBe(false);
		expect(layer.wanted).toBe(false);
		expect(asked).toEqual([]);
	});
});
