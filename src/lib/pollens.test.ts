import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pollenPeaks, pollensFromApi, pollenText, speciesLabel } from './pollens';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('pollen', () => {
	it('reads a quiet day of the API: four days, no species worth a line', () => {
		const value = pollensFromApi(fixture('pollens-corte.json'))!;
		expect(value.status).toBe('available');
		expect(value.daily).toHaveLength(4);
		expect(value.dominant).toBeNull();
		expect(pollenPeaks(value)).toEqual([]);
		expect(value.attribution).toContain('CAMS');
	});

	it('orders the species by their peak and leaves out those under one grain per m³', () => {
		const value = pollensFromApi(fixture('pollens-season.json'))!;
		expect(pollenPeaks(value)).toEqual([
			{ species: 'birch', peak: 96 },
			{ species: 'grass', peak: 9 }
		]);
		expect(value.dominant).toBe('birch');
	});

	it('shows nothing outside Europe and refuses a malformed answer', () => {
		expect(pollensFromApi({ status: 'outside_coverage', pollens: null })?.status).toBe('outside_coverage');
		expect(pollensFromApi({ status: 'nope' })).toBeNull();
		expect(pollensFromApi(null)).toBeNull();
	});

	it('speaks French and English', () => {
		expect(speciesLabel('fr', 'grass')).toBe('Graminées');
		expect(speciesLabel('en', 'ragweed')).toBe('Ragweed');
		expect(pollenText('fr', 'summary', { species: 'Bouleau', peak: 96 })).toBe(
			'Pollens : Bouleau en tête, jusqu’à 96 grains/m³'
		);
	});
});
