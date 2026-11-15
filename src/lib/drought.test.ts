import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DROUGHT_COUNTRIES,
	droughtFromApi,
	droughtLevelLabel,
	droughtSeverityTone,
	droughtStatusFromApi,
	droughtText,
	isCoveredDroughtCountry,
	waterTypeLabel
} from './drought';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('VigiEau drought restrictions', () => {
	const raw = fixture('drought-fr.json');

	it('covers only metropolitan France and DROM territories', () => {
		for (const cc of DROUGHT_COUNTRIES) {
			expect(isCoveredDroughtCountry(cc)).toBe(true);
		}
		expect(isCoveredDroughtCountry('fr')).toBe(true);
		expect(isCoveredDroughtCountry('US')).toBe(false);
		expect(isCoveredDroughtCountry('GB')).toBe(false);
		expect(isCoveredDroughtCountry(null)).toBe(false);
	});

	it('parses detailed VigiEau response with ambiguous water types, decrees, and Etalab attribution', () => {
		const parsed = droughtFromApi(raw)!;
		expect(parsed).not.toBeNull();
		expect(parsed.status).toBe('available');
		expect(parsed.maxLevel).toBe('alerte_renforcee');
		expect(parsed.restrictionsInForce).toBe(true);
		expect(parsed.ambiguousWaterTypes).toContain('SUP');
		expect(parsed.zones.length).toBeGreaterThan(0);
		expect(parsed.attribution).toContain('Licence Ouverte 2.0');
	});

	it('parses compact point.drought status and maps severity tones accurately', () => {
		const compact = droughtStatusFromApi({
			status: 'available',
			max_level: 'crise',
			restrictions_in_force: true,
			department: '31',
			zones: [
				{
					id: 1,
					name: 'Garonne amont',
					water_type: 'SUP',
					level: 'crise',
					influenced_resource: true
				}
			],
			availability: { SUP: { status: 'ok' } },
			attribution: raw.attribution
		})!;
		expect(compact.status).toBe('available');
		expect(compact.maxLevel).toBe('crise');
		expect(compact.zones[0].influencedResource).toBe(true);
		expect(droughtSeverityTone('vigilance')).toBe('YELLOW');
		expect(droughtSeverityTone('alerte')).toBe('ORANGE');
		expect(droughtSeverityTone('alerte_renforcee')).toBe('ORANGE');
		expect(droughtSeverityTone('crise')).toBe('RED');
		expect(droughtSeverityTone(null)).toBeNull();
	});

	it('handles outside_coverage and ambiguous_commune cleanly', () => {
		expect(droughtFromApi({ status: 'outside_coverage', zones: [] })?.status).toBe('outside_coverage');
		expect(
			droughtFromApi({
				status: 'ambiguous_commune',
				ambiguous_water_types: ['AEP'],
				zones: []
			})?.ambiguousWaterTypes
		).toEqual(['AEP']);
		expect(droughtFromApi(null)).toBeNull();
		expect(droughtStatusFromApi(null)).toBeNull();
	});

	it('provides clear FR and EN labels for every drought level and water type', () => {
		for (const level of ['vigilance', 'alerte', 'alerte_renforcee', 'crise'] as const) {
			expect(droughtLevelLabel('fr', level)).toBeTruthy();
			expect(droughtLevelLabel('en', level)).toBeTruthy();
		}
		for (const wt of ['AEP', 'SUP', 'SOU'] as const) {
			expect(waterTypeLabel('fr', wt)).toContain(wt);
			expect(waterTypeLabel('en', wt)).toContain(wt);
		}
		expect(droughtText('fr', 'ambiguousNote', { types: 'Eau superficielle (SUP)' })).toContain('VigiEau');
		expect(droughtText('en', 'ambiguousNote', { types: 'Surface water (SUP)' })).toContain('VigiEau');
	});
});
