import { describe, expect, it } from 'vitest';
import {
	boxesOverlap,
	countryBox,
	coveredInView,
	geometryBox,
	grow,
	hasBox,
	pointInBox,
	type Box
} from './geo';

describe('boxes', () => {
	it('detects overlap and separation', () => {
		expect(boxesOverlap([0, 40, 10, 50], [5, 45, 15, 55])).toBe(true);
		expect(boxesOverlap([0, 40, 10, 50], [20, 45, 30, 55])).toBe(false);
		expect(boxesOverlap([0, 40, 10, 50], [0, 60, 10, 70])).toBe(false);
	});

	it('handles a view that crosses the antimeridian', () => {
		const pacific: Box = [170, -50, 190, -30];
		expect(boxesOverlap(pacific, [-180, -48, -175, -43])).toBe(true);
		expect(pointInBox(pacific, -178, -40)).toBe(true);
		expect(pointInBox(pacific, 160, -40)).toBe(false);
	});

	it('treats a view wider than the world as everything', () => {
		expect(pointInBox([-300, -85, 300, 85], 120, 10)).toBe(true);
	});
});

describe('countries', () => {
	it('has the boxes of the countries the API has a border for', () => {
		expect(hasBox('fr')).toBe(true);
		expect(hasBox('BR')).toBe(true);
		// Since vigie-api 9da278c, every country of Natural Earth, Japan included (it has no source: law_restricts).
		expect(hasBox('JP')).toBe(true);
		expect(hasBox('XX')).toBe(false);
	});

	it('finds the served countries in a view, and only them', () => {
		const inView = coveredInView([-2, 43, 6, 49], ['FR', 'US', 'ES']);
		expect(inView).toContain('FR');
		expect(inView).toContain('ES');
		expect(inView).not.toContain('US');
		expect(coveredInView([-2, 43, 6, 49], ['US'])).toEqual([]);
		// A code the API serves but the site has no box for is left out, not an error.
		expect(coveredInView([-180, -85, 180, 85], ['ZZ'])).toEqual([]);
	});

	it('frames the main land part of a country', () => {
		const box = countryBox('FR')!;
		expect(pointInBox(box, 2.35, 48.85)).toBe(true);
	});

	it('computes the box of a geometry', () => {
		expect(
			geometryBox({
				type: 'MultiLineString',
				coordinates: [
					[
						[1, 2],
						[3, 4]
					],
					[
						[-1, 0],
						[0, 5]
					]
				]
			})
		).toEqual([-1, 0, 3, 5]);
	});
});

describe('grow', () => {
	it('adds a share of the size on every side, also across the antimeridian, and stays off the poles', () => {
		const g = grow([-82.9, 7.4, -78, 9], 0.1);
		[-83.39, 7.24, -77.51, 9.16].forEach((v, i) => expect(g[i]).toBeCloseTo(v, 6));
		const pacific = grow([170, -20, -170, -10], 0.1);
		expect(pacific[0]).toBeCloseTo(168, 6);
		expect(pacific[2]).toBeCloseTo(-168, 6);
		expect(grow([0, -84, 10, 84], 0.5)).toEqual([-5, -85, 15, 85]);
	});
});
