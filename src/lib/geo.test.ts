import { describe, expect, it } from 'vitest';
import { boxesOverlap, countryBox, coveredInView, geometryBox, isCovered, pointInBox, type Box } from './geo';

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

describe('covered countries', () => {
	it('knows France and the United States, not Japan', () => {
		expect(isCovered('fr')).toBe(true);
		expect(isCovered('US')).toBe(true);
		expect(isCovered('JP')).toBe(false);
	});

	it('finds France in a view of France, not the United States', () => {
		const inView = coveredInView([-2, 43, 6, 49]);
		expect(inView).toContain('FR');
		expect(inView).not.toContain('US');
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
