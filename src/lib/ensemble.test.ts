import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHIP_MIN_PCT, ensembleView, hourLabel, percent, placeMinutes } from './ensemble';
import { pointFromApi } from './transform';
import type { EnsembleWindow, PointWeather } from './types';

const HOUR = 3600;
const win = (to: number, over: Partial<EnsembleWindow> = {}): EnsembleWindow => ({
	to,
	rain1Pct: 0,
	rain5Pct: 0,
	snowPct: 0,
	gust30ktPct: 0,
	hailPct: 0,
	stormPct: 0,
	...over
});
const block = (windows: EnsembleWindow[]): PointWeather['probabilities'] => ({
	runUtc: 3 * HOUR,
	windows,
	attribution: null
});

describe('the hours of the place', () => {
	it('gives the minutes since midnight at the place, across midnight', () => {
		expect(placeMinutes(12 * HOUR, 2 * HOUR)).toBe(14 * 60);
		expect(placeMinutes(23 * HOUR, 2 * HOUR)).toBe(60);
		expect(placeMinutes(HOUR, -5 * HOUR)).toBe(20 * 60);
		expect(placeMinutes(0, 5.5 * HOUR)).toBe(330);
	});
	it('writes them in the language, with the minutes only when there are some', () => {
		expect(hourLabel('fr', 6 * 60)).toBe('6 h');
		expect(hourLabel('fr', 330)).toBe('5 h 30');
		expect(hourLabel('en', 6 * 60)).toBe('06:00');
		expect(hourLabel('en', 330)).toBe('05:30');
		expect(percent('fr', 48)).toBe('48 %');
		expect(percent('en', 48)).toBe('48%');
	});
});

describe('ensembleView', () => {
	it('shows nothing without the block, without a window or without the time zone of the place', () => {
		expect(ensembleView(null, 3600)).toBeNull();
		expect(ensembleView(block([]), 3600)).toBeNull();
		expect(ensembleView(block([win(HOUR)]), null)).toBeNull();
	});

	it('draws one bar per window, in the hours of the place, the strong ones from 50 %', () => {
		const view = ensembleView(
			block([
				win(12 * HOUR, { rain1Pct: 49 }),
				win(15 * HOUR, { rain1Pct: 50 }),
				win(18 * HOUR, { rain1Pct: null })
			]),
			2 * HOUR
		);
		expect(view?.bars).toEqual([
			{ endMinutes: 14 * 60, rain1Pct: 49, high: false },
			{ endMinutes: 17 * 60, rain1Pct: 50, high: true },
			{ endMinutes: 20 * 60, rain1Pct: null, high: false }
		]);
		expect(view?.runUtc).toBe(3 * HOUR);
	});

	it('keeps the eight windows of the next 24 hours at most', () => {
		const windows = Array.from({ length: 12 }, (_, i) => win((i + 1) * 3 * HOUR));
		expect(ensembleView(block(windows), 0)?.bars).toHaveLength(8);
	});

	it('adds a chip from 10 %, not below', () => {
		expect(CHIP_MIN_PCT).toBe(10);
		const below = ensembleView(
			block([win(3 * HOUR, { rain5Pct: 9, gust30ktPct: 9, stormPct: 9, hailPct: 9, snowPct: 9 })]),
			0
		);
		expect(below?.chips).toEqual([]);
		const at = ensembleView(
			block([win(3 * HOUR, { rain5Pct: 10, gust30ktPct: 10, stormPct: 10, hailPct: 10, snowPct: 10 })]),
			0
		);
		expect(at?.chips.map((c) => [c.kind, c.pct])).toEqual([
			['rain5', 10],
			['gust', 10],
			['storm', 10],
			['hail', 10],
			['snow', 10]
		]);
	});

	it('places the rain of 5 mm at its highest window and the gusts until the last window at the threshold', () => {
		const view = ensembleView(
			block([
				win(3 * HOUR, { rain5Pct: 20, gust30ktPct: 100 }),
				win(6 * HOUR, { rain5Pct: 48, gust30ktPct: 87 }),
				win(9 * HOUR, { rain5Pct: 48, gust30ktPct: 99 }),
				win(12 * HOUR, { rain5Pct: 5, gust30ktPct: 4 }),
				win(15 * HOUR, { rain5Pct: 0, gust30ktPct: 12 }),
				win(18 * HOUR, { rain5Pct: 0, gust30ktPct: 3 })
			]),
			0
		);
		expect(view?.chips).toEqual([
			{ kind: 'rain5', pct: 48, atMinutes: 6 * 60, strong: false }, // the first of two equal windows
			{ kind: 'gust', pct: 100, atMinutes: 15 * 60, strong: true }
		]);
	});

	it('marks a gust, a storm or hail at half or more, and never the rain or the snow', () => {
		const view = ensembleView(
			block([win(3 * HOUR, { rain5Pct: 90, snowPct: 80, stormPct: 50, hailPct: 49, gust30ktPct: 50 })]),
			0
		);
		expect(Object.fromEntries(view!.chips.map((c) => [c.kind, c.strong]))).toEqual({
			rain5: false,
			gust: true,
			storm: true,
			hail: false,
			snow: false
		});
	});

	it('reads the recorded answer of a point in France: eight bars, the rain, the gusts and the storm, no hail', () => {
		const raw = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'point.json'), 'utf-8'));
		const point = pointFromApi(raw);
		const view = ensembleView(point.probabilities, point.utcOffsetS);
		expect(view?.bars.map((b) => b.rain1Pct)).toEqual([95, 83, 57, 41, 89, 94, 78, 82]);
		expect(view?.chips.map((c) => [c.kind, c.pct])).toEqual([
			['rain5', 51],
			['gust', 95],
			['storm', 11]
		]);
	});
});
