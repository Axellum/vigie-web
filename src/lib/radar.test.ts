import { describe, expect, it } from 'vitest';
import { radarFromApi, radarInView, radarTiles, radarTime, rate, RADAR_FRAMES } from './radar';

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
		expect(radarTiles(1794995100)).toBe('/data/radar/1794995100/{z}/{x}/{y}.png');
	});

	it('shows the card on France only, close enough for the tiles', () => {
		expect(radarInView([-6, 41, 10, 51.5], 5, 3)).toBe(true);
		expect(radarInView([-170, -58, 190, 75], 1.4, 3)).toBe(false);
		expect(radarInView([-6, 41, 10, 51.5], 2, 3)).toBe(false);
		expect(radarInView([100, -10, 120, 10], 6, 3)).toBe(false);
		expect(radarInView(null, 6, 3)).toBe(false);
	});

	it('writes rates and times in the language and time zone of the reader', () => {
		expect(rate('fr', 0.1)).toBe('0,1');
		expect(rate('en', 0.1)).toBe('0.1');
		expect(rate('en', 64)).toBe('64');
		expect(radarTime('fr', 1_794_993_000, 'Europe/Paris')).toBe('10:10');
		expect(radarTime('fr', 1_794_993_000, 'UTC')).toBe('09:10');
	});
});
