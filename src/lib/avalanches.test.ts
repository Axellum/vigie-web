import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	aspectLabel,
	avalancheLevelLabel,
	avalancheProblemLabel,
	avalanchesFromApi,
	avalancheTone,
	elevationText,
	isCoveredAvalancheCountry,
	originalLabel,
	ratingBands
} from './avalanches';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('avalanche bulletins', () => {
	const value = avalanchesFromApi(fixture('avalanches-davos.json'))!;

	it('reads the SLF bulletin of Davos', () => {
		expect(value.status).toBe('active');
		expect(value.regionName).toBe('Davos');
		expect(value.maxLevel).toBe(2);
		expect(value.bulletins).toHaveLength(1);
		const b = value.bulletins[0];
		expect(b.problems.map((p) => p.type)).toEqual(['wind_slab', 'persistent_weak_layers']);
		expect(b.problems[0]).toMatchObject({
			lowerM: '2400',
			upperM: null,
			aspects: ['N', 'NE', 'E', 'SE', 'NW']
		});
		expect(b.snowpack).toContain('little snow');
		expect(b.url).toContain('slf.ch');
	});

	it('drops an expired bulletin and keeps an off-season answer', () => {
		const raw = fixture('avalanches-davos.json');
		raw.bulletins[0].is_expired = true;
		expect(avalanchesFromApi(raw)!.bulletins).toEqual([]);
		expect(avalanchesFromApi({ status: 'confirmed_none', bulletins: [] })!.status).toBe('confirmed_none');
		expect(avalanchesFromApi({ status: 'nope' })).toBeNull();
	});

	it('writes the scale, the problems, the altitude and the aspects in French and English', () => {
		expect(avalancheLevelLabel('fr', 3)).toBe('3 · Marqué');
		expect(avalancheLevelLabel('en', 3)).toBe('3 · Considerable');
		expect(avalancheProblemLabel('fr', 'wind_slab')).toBe('Neige soufflée');
		expect(avalancheProblemLabel('en', 'glide_cracks')).toBe('glide cracks');
		const p = value.bulletins[0].problems[0];
		expect(elevationText('fr', p)).toBe('au-dessus de 2400 m');
		expect(elevationText('en', { ...p, lowerM: null, upperM: 'treeline' })).toBe('below the treeline');
		expect(elevationText('fr', { ...p, lowerM: null })).toBeNull();
		expect(aspectLabel('fr', 'NW')).toBe('NO');
		expect(aspectLabel('en', 'NW')).toBe('NW');
	});

	it('colours the levels and is asked in the Alpine countries only', () => {
		expect([1, 2, 3, 4, 5].map(avalancheTone)).toEqual(['GREEN', 'YELLOW', 'ORANGE', 'RED', 'RED']);
		expect(avalancheTone(null)).toBeNull();
		expect(isCoveredAvalancheCountry('CH')).toBe(true);
		expect(isCoveredAvalancheCountry('FR')).toBe(true);
		expect(isCoveredAvalancheCountry('ES')).toBe(false);
	});

	it('shows the bands of altitude only when the danger changes with them', () => {
		const b = value.bulletins[0];
		expect(ratingBands(b)).toEqual([]);
		const two = {
			...b,
			ratings: [
				{ level: 2, lowerM: null, upperM: '2700' },
				{ level: 3, lowerM: '2700', upperM: null }
			]
		};
		expect(ratingBands(two).map((r) => elevationText('fr', r))).toEqual([
			'au-dessous de 2700 m',
			'au-dessus de 2700 m'
		]);
		expect(ratingBands({ ...two, ratings: two.ratings.map((r) => ({ ...r, level: 2 })) })).toEqual([]);
	});

	it('says the language of the texts only when it is not the page’s', () => {
		expect(originalLabel('fr', 'en')).toBe('Texte du bulletin, en anglais');
		expect(originalLabel('fr', 'fr')).toBe('Texte du bulletin');
		expect(originalLabel('en', 'fr')).toBe('Text of the bulletin, in French');
		expect(originalLabel('en', null)).toBe('Text of the bulletin');
		expect(originalLabel('fr', 'xx')).toBe('Texte du bulletin');
	});
});
