import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadarLayer } from './radarLayer.svelte';

// The site's route gives the card the images in the form of `Radar` (radar.ts). The card follows the area the map is on: it asks the site for that area's images, shows only those, and drops them when the
// map moves to another area.
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

const FRANCE: [number, number, number, number] = [-5.5, 41.2, 9.8, 51.3];
const MARTINIQUE: [number, number, number, number] = [-62.5, 14, -60.5, 16.5];

function stubFetch() {
	const asked: string[] = [];
	vi.stubGlobal('fetch', async (address: string) => {
		asked.push(address);
		const area = new URL(address, 'http://site').searchParams.get('area') ?? '';
		return new Response(JSON.stringify(list(area)), { status: 200 });
	});
	return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe('RadarLayer', () => {
	it('asks the images of the area in view, and shows the tiles of that area', async () => {
		const asked = stubFetch();
		const layer = new RadarLayer();
		layer.move(MARTINIQUE, 7);
		expect(layer.area).toBe('antilles');
		layer.sync();
		await vi.waitFor(() => expect(layer.status).toBe('ok'));
		expect(asked).toEqual(['/data/radar.json?area=antilles']);
		expect(layer.shown).toBe(true);
		expect(layer.onMap('credit')?.frames[0].tiles).toBe('/data/radar/antilles/1794995100/{z}/{x}/{y}.png');
	});

	it('drops the images of an area the map left and asks the new one', async () => {
		const asked = stubFetch();
		const layer = new RadarLayer();
		layer.move(MARTINIQUE, 7);
		layer.sync();
		await vi.waitFor(() => expect(layer.data?.attribution).toContain('antilles'));

		layer.move(FRANCE, 5);
		expect(layer.area).toBe('france');
		expect(layer.data).toBeNull(); // the Antilles' images are not France's
		expect(layer.onMap('credit')).toBeNull();
		layer.sync();
		await vi.waitFor(() => expect(layer.data?.attribution).toContain('france'));
		expect(layer.onMap('credit')?.frames[0].tiles).toBe('/data/radar/france/1794995100/{z}/{x}/{y}.png');
		expect(asked).toEqual(['/data/radar.json?area=antilles', '/data/radar.json?area=france']);
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
