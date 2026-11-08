import { describe, expect, it } from 'vitest';
import { fromKn, toKn, unitLabel, windRangeText, windText } from './units';

describe('the wind in knots or in km/h', () => {
	it('converts with the nautical mile, 1.852 km/h per knot, and back to the same figure', () => {
		expect(fromKn(10, 'kn')).toBe(10);
		expect(fromKn(10, 'kmh')).toBeCloseTo(18.52, 6);
		for (const kn of [0.5, 12, 25, 59.9]) expect(toKn(fromKn(kn, 'kmh'), 'kmh')).toBeCloseTo(kn, 9);
		expect(toKn(37.04, 'kmh')).toBeCloseTo(20, 9);
	});

	it('writes a wind and a range in the unit chosen, in each language', () => {
		expect(windText('fr', 12, 'kn')).toBe('12 nœuds');
		expect(windText('en', 12, 'kn')).toBe('12 kn');
		expect(windText('fr', 12, 'kmh').replace(/\s/g, ' ')).toBe('22 km/h');
		expect(windRangeText('fr', { min: 12, max: 25 }, 'kn')).toBe('12 à 25 nœuds');
		expect(windRangeText('en', { min: 12, max: 25 }, 'kmh').replace(/\s/g, ' ')).toBe('22 to 46 km/h');
		expect(unitLabel('en', 'kmh')).toBe('km/h');
	});
});
