import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { countryName } from './i18n';
import { fold, nearestPlace, parsePlaceLine, searchPlaces, type PlaceEntry } from './places';

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

describe('nearestPlace', () => {
	const at = (lat: number, lon: number) => nearestPlace(entries, lat, lon);

	it('names a point by the town it is in, overseas too', () => {
		expect(at(14.44, -60.88)).toMatchObject({ name: 'Sainte-Anne', cc: 'MQ' });
		expect(at(16.24, -61.53)).toMatchObject({ name: 'Pointe-à-Pitre', cc: 'GP' });
		expect(at(45.92, 6.87)).toMatchObject({ name: 'Chamonix-Mont-Blanc', cc: 'FR' });
	});

	it('gives the city rather than one of its districts', () => {
		expect(at(48.86, 2.35)).toMatchObject({ name: 'Paris', cc: 'FR' });
		expect(at(43.3, 5.37)).toMatchObject({ name: 'Marseille', cc: 'FR' });
	});

	it('takes the nearest town when no bigger one is about as near', () => {
		expect(at(14.61, -61.0)).toMatchObject({ name: 'Le Lamentin', cc: 'MQ' });
	});

	it('names nothing far from any place, and leaves the search keys out', () => {
		expect(at(30, -40)).toBeNull();
		expect(Object.keys(at(14.44, -60.88) ?? {})).not.toContain('keys');
	});
});
