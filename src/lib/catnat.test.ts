import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catnatFromApi, catnatSummary, catnatTypeLabel, isCoveredCatNatCountry } from './catnat';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('recognised natural disasters', () => {
	const value = catnatFromApi(fixture('catnat-corte.json'))!;

	it('reads the commune, the count by kind and the decrees', () => {
		expect(value.status).toBe('available');
		expect(value.commune).toMatchObject({ inseeCode: '2B074', name: 'Casanova', department: '2B' });
		expect(value.total).toBe(3);
		expect(value.byType).toEqual([{ category: 'floods', typeLabel: 'Inondations', count: 3 }]);
		expect(value.decrees[0]).toMatchObject({ startDate: '2011-11-04', decreeDate: '2011-11-18' });
		expect(value.attribution).toContain('Licence Ouverte 2.0');
	});

	it('sums it up in one line', () => {
		expect(catnatSummary('fr', value)).toBe(
			'Catastrophes naturelles : 3 reconnues depuis 1982, la dernière en 2011'
		);
		expect(catnatSummary('en', { ...value, total: 0, status: 'confirmed_none' })).toBe(
			'Natural disasters: none recognised since 1982'
		);
		expect(catnatSummary('fr', { ...value, total: 1 })).toBe(
			'Catastrophes naturelles : 1 reconnue depuis 1982, en 2011'
		);
	});

	it('names the kinds in English and keeps the French of GASPAR', () => {
		expect(catnatTypeLabel('fr', 'floods', 'Inondations')).toBe('Inondations');
		expect(catnatTypeLabel('en', 'floods', 'Inondations')).toBe('Floods');
		expect(catnatTypeLabel('en', 'unknown_kind', 'Autre chose')).toBe('Autre chose');
	});

	it('is asked in France and its overseas departments only', () => {
		expect(isCoveredCatNatCountry('FR')).toBe(true);
		expect(isCoveredCatNatCountry('re')).toBe(true);
		expect(isCoveredCatNatCountry('CH')).toBe(false);
		expect(isCoveredCatNatCountry(undefined)).toBe(false);
		expect(catnatFromApi({ status: 'x' })).toBeNull();
	});
});
