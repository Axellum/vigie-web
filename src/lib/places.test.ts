import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { countryName } from './i18n';
import { fold, parsePlaceLine, searchPlaces, type PlaceEntry } from './places';

const entries = gunzipSync(readFileSync(join(process.cwd(), 'data', 'places.tsv.gz')))
	.toString('utf-8')
	.split('\n')
	.map(parsePlaceLine)
	.filter((e): e is PlaceEntry => e !== null);
const names = (cc: string) => [countryName('fr', cc), countryName('en', cc)];
const search = (q: string) => searchPlaces(entries, q, names);

describe('fold', () => {
	it('drops accents, case, fancy apostrophes and dashes', () => {
		expect(fold('  Saint-Étienne ')).toBe('saint etienne');
		expect(fold('L’Île-Rousse')).toBe("l'ile rousse");
	});
});

describe('the places file', () => {
	it('holds every GeoNames place of at least 500 people, with a position', () => {
		expect(entries.length).toBeGreaterThan(200_000);
		expect(entries.every((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon))).toBe(true);
	});
});

describe('searchPlaces', () => {
	it('finds a small town by its name', () => {
		const [first] = search('Corte');
		expect(first).toMatchObject({ name: 'Corte', cc: 'FR' });
		expect(first.lat).toBeCloseTo(42.31, 1);
	});

	it('puts the most populated place of a name first', () => {
		expect(search('Paris')[0]).toMatchObject({ name: 'Paris', cc: 'FR' });
		expect(search('london')[0]).toMatchObject({ name: 'London', cc: 'GB' });
	});

	it('finds a large city by its name in another language, with or without accents', () => {
		expect(search('Genève')[0]).toMatchObject({ name: 'Geneva', cc: 'CH' });
		expect(search('geneve')[0]).toMatchObject({ name: 'Geneva', cc: 'CH' });
		expect(search('Londres')[0]).toMatchObject({ name: 'London', cc: 'GB' });
	});

	it('narrows by region or country after a comma', () => {
		const us = search('Paris, États-Unis');
		expect(us.length).toBeGreaterThan(0);
		expect(us.every((p) => p.cc === 'US')).toBe(true);
		expect(search('Paris, Texas')[0]).toMatchObject({ name: 'Paris', cc: 'US', region: 'Texas' });
	});

	it('completes the start of a name, and ignores a query too short', () => {
		const results = search('bastia');
		expect(results[0].name).toMatch(/^Bastia/);
		expect(search('b')).toEqual([]);
		expect(search('zzzzqqq')).toEqual([]);
	});

	it('returns at most the limit, without the search keys', () => {
		const results = searchPlaces(entries, 'san', names, 5);
		expect(results.length).toBe(5);
		expect(Object.keys(results[0])).not.toContain('keys');
	});
});
