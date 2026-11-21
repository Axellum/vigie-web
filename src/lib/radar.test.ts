import { describe, expect, it } from 'vitest';
import { radarAreaFrom, radarAreaOf, radarFromApi, radarTiles, radarTime, rate, RADAR_FRAMES } from './radar';

const body = (n: number) => ({
	status: 'ok',
	frames: Array.from({ length: n }, (_, i) => ({
		epoch: 1_794_990_900 + i * 300,
		time: '2026-11-18T08:35:00Z'
	})).reverse(),
	interval_minutes: 5,
	bounds: [-9.97, 37.45, 17.57, 53.67],
	min_zoom: 3,
	max_zoom: 10,
	legend: [
		{ min_mm_h: 0.1, color: '#a6cee3', alpha: 0.67 },
		{ min_mm_h: 64, color: '#581c87', alpha: 1 },
		{ min_mm_h: 1, color: 'red', alpha: 1 }
	],
	attribution: 'Source: Météo-France'
});

describe('radar', () => {
	it('keeps the last images, the oldest first, and the classes it can draw', () => {
		const r = radarFromApi(body(15));
		expect(r?.frames).toHaveLength(RADAR_FRAMES);
		expect(r?.frames.at(-1)).toBe(1_794_990_900 + 14 * 300);
		expect([...(r?.frames ?? [])].sort((a, b) => a - b)).toEqual(r?.frames);
		expect(r?.legend.map((c) => c.minMmH)).toEqual([0.1, 64]);
		expect(r).toMatchObject({
			minZoom: 3,
			maxZoom: 10,
			intervalMinutes: 5,
			attribution: 'Source: Météo-France'
		});
	});

	it('shows nothing for an answer without image', () => {
		expect(radarFromApi(null)).toBeNull();
		expect(radarFromApi({ status: 'unavailable', frames: [] })).toBeNull();
		expect(radarFromApi({ ...body(3), frames: [] })).toBeNull();
		expect(radarFromApi({ ...body(3), legend: [] })).toBeNull();
	});

	it('addresses the tiles on the site', () => {
		expect(radarTiles('france', 1794995100)).toBe('/data/radar/france/1794995100/{z}/{x}/{y}.png');
		expect(radarTiles('antilles', 1794995100)).toBe('/data/radar/antilles/1794995100/{z}/{x}/{y}.png');
	});

	it('knows the areas of the API and no other', () => {
		expect(radarAreaFrom('new-caledonia')).toBe('new-caledonia');
		expect(radarAreaFrom('france')).toBe('france');
		for (const bad of ['', 'guyane', 'toString', '__proto__', 'FRANCE'])
			expect(radarAreaFrom(bad)).toBeNull();
	});

	it('shows the card on France, or on an overseas area the view is centred on, close enough for the tiles', () => {
		expect(radarAreaOf([-6, 41, 10, 51.5], 5, 3)).toBe('france');
		expect(radarAreaOf([-170, -58, 190, 75], 1.4, 3)).toBeNull();
		expect(radarAreaOf([-6, 41, 10, 51.5], 2, 3)).toBeNull();
		expect(radarAreaOf([100, -10, 120, 10], 6, 3)).toBeNull();
		expect(radarAreaOf(null, 6, 3)).toBeNull();
		// Martinique and Guadeloupe, La Reunion, Noumea.
		expect(radarAreaOf([-62.5, 14, -60.5, 16.5], 7, 3)).toBe('antilles');
		expect(radarAreaOf([55, -21.5, 56, -20.8], 9, 3)).toBe('reunion');
		expect(radarAreaOf([166, -23, 167, -22], 9, 3)).toBe('new-caledonia');
		// A view of the whole western Pacific, whose centre is in no mosaic, shows no card, and neither does one too far out.
		expect(radarAreaOf([110, -48, 180, 40], 3.5, 3)).toBeNull();
		expect(radarAreaOf([55, -21.5, 56, -20.8], 2, 3)).toBeNull();
		// Cayenne, Mayotte and Papeete have no mosaic.
		expect(radarAreaOf([-52.5, 4.5, -52, 5.2], 9, 3)).toBeNull();
		expect(radarAreaOf([45, -13, 45.4, -12.6], 9, 3)).toBeNull();
		expect(radarAreaOf([-149.7, -17.7, -149.3, -17.4], 9, 3)).toBeNull();
		// A view whose longitudes run past 180 (a map panned round the world) still finds the Antilles.
		expect(radarAreaOf([295, 14, 299, 17], 7, 3)).toBe('antilles');
	});

	it('writes rates and times in the language and time zone of the reader', () => {
		expect(rate('fr', 0.1)).toBe('0,1');
		expect(rate('en', 0.1)).toBe('0.1');
		expect(rate('en', 64)).toBe('64');
		expect(radarTime('fr', 1_794_993_000, 'Europe/Paris')).toBe('10:10');
		expect(radarTime('fr', 1_794_993_000, 'UTC')).toBe('09:10');
	});
});
