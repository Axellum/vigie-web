import { describe, expect, it } from 'vitest';
import fixture from '../../../e2e/fixtures/tv-activities-hossegor.json';
import { sunWindows } from './sun';

// The reference is the sun the API gave for a real spot (its fixture, recorded from the API): our own equation must agree with it to
// a couple of minutes, which is all a screen needs to turn itself to night.
const spot = fixture.spot as { lat: number; lon: number };
const reference = fixture.sun as { sunrise_utc: number; sunset_utc: number }[];

describe('sunWindows', () => {
	it('agrees with the sun the API gave, to two minutes, day after day', () => {
		const now = reference[0].sunrise_utc + 3 * 3600;
		const windows = sunWindows(spot.lat, spot.lon, now);
		for (const day of reference) {
			const found = windows.find(([rise]) => Math.abs(rise - day.sunrise_utc) < 3600);
			expect(found, `no window near ${day.sunrise_utc}`).toBeDefined();
			expect(Math.abs(found![0] - day.sunrise_utc)).toBeLessThanOrEqual(120);
			expect(Math.abs(found![1] - day.sunset_utc)).toBeLessThanOrEqual(120);
		}
	});

	it('gives the windows in time order, none of them over for more than a day', () => {
		const now = reference[1].sunrise_utc + 5 * 3600;
		const windows = sunWindows(spot.lat, spot.lon, now);
		expect(windows.length).toBeGreaterThanOrEqual(3);
		for (let i = 0; i < windows.length; i++) {
			expect(windows[i][1]).toBeGreaterThan(windows[i][0]);
			expect(windows[i][1]).toBeGreaterThan(now - 86_400);
			if (i > 0) expect(windows[i][0]).toBeGreaterThan(windows[i - 1][0]);
		}
	});

	it('knows a place on the other side of the world and the date line', () => {
		// Auckland, near the antimeridian: the day of the screen is not the day of Greenwich, and the windows must still hold now.
		const now = Date.UTC(2026, 10, 8, 0, 0) / 1000;
		const windows = sunWindows(-36.85, 174.76, now);
		const day = windows.filter(([rise, set]) => now >= rise && now < set);
		// 00:00 UTC is 13:00 in Auckland (UTC+13 in November): the Sun is up.
		expect(day.length).toBe(1);
		const lengthH = (day[0][1] - day[0][0]) / 3600;
		expect(lengthH).toBeGreaterThan(13);
		expect(lengthH).toBeLessThan(15);
	});

	it('has no window in the polar night and no failure at the pole', () => {
		const midwinter = Date.UTC(2026, 11, 21, 12, 0) / 1000;
		expect(sunWindows(78.2, 15.6, midwinter)).toEqual([]); // Longyearbyen
		expect(sunWindows(90, 0, midwinter)).toEqual([]);
		expect(sunWindows(Number.NaN, 0, midwinter)).toEqual([]);
	});

	it('has no window in the midnight sun either: no sunset to give', () => {
		const midsummer = Date.UTC(2026, 5, 21, 12, 0) / 1000;
		expect(sunWindows(78.2, 15.6, midsummer)).toEqual([]);
	});
});
