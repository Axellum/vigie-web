import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Geometry } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
	circleBox,
	circleRing,
	countriesNear,
	countryAt,
	type Borders,
	distanceKm,
	geometryHolds,
	hazardsNear,
	lineDistanceKm,
	parsePlace,
	placeHash,
	snapToGrid,
	warningsAt
} from './near';
import { hazardsFromApi, warningsFromApi } from './transform';

const fixture = (name: string): unknown =>
	JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', `${name}.json`), 'utf-8'));

const BASTIA = { lat: 42.697, lon: 9.45 }; // Haute-Corse
const AJACCIO = { lat: 41.919, lon: 8.738 }; // Corse-du-Sud

describe('distances and grid', () => {
	it('measures great-circle distances', () => {
		expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
		expect(distanceKm(BASTIA, BASTIA)).toBe(0);
	});

	it('snaps to the weather grid of the API, without a negative zero', () => {
		expect(snapToGrid({ lat: 48.8566, lon: 2.3522 })).toEqual({ lat: 48.85, lon: 2.35 });
		expect(snapToGrid({ lat: -0.01, lon: -0.02 })).toEqual({ lat: 0, lon: 0 });
		expect(Object.is(snapToGrid({ lat: -0.01, lon: 0 }).lat, -0)).toBe(false);
		expect(snapToGrid({ lat: 12.3456, lon: -179.99 })).toEqual({ lat: 12.35, lon: -180 });
	});
});

describe('the address of a place', () => {
	it('reads a position and an optional radius', () => {
		expect(parsePlace('#48.853,2.349')).toEqual({ lat: 48.853, lon: 2.349, radiusKm: null });
		expect(parsePlace('#-33.9,151.2,300')).toEqual({ lat: -33.9, lon: 151.2, radiusKm: 300 });
	});

	it('refuses anything else', () => {
		for (const bad of ['', '#', '#abc', '#91,0', '#0,181', '#1,2,3,4', '#lat=1&lon=2']) {
			expect(parsePlace(bad)).toBeNull();
		}
	});

	it('writes 3 decimals and the radius, and reads back the same place', () => {
		const hash = placeHash({ lat: 48.85341, lon: 2.3488 }, 300);
		expect(hash).toBe('#48.853,2.349,300');
		expect(parsePlace(hash)).toEqual({ lat: 48.853, lon: 2.349, radiusKm: 300 });
	});
});

describe('shapes', () => {
	const square: Geometry = {
		type: 'Polygon',
		coordinates: [
			[
				[0, 0],
				[10, 0],
				[10, 10],
				[0, 10],
				[0, 0]
			],
			[
				[4, 4],
				[6, 4],
				[6, 6],
				[4, 6],
				[4, 4]
			]
		]
	};

	it('holds a point inside an area and not inside its hole', () => {
		expect(geometryHolds(square, { lat: 2, lon: 2 })).toBe(true);
		expect(geometryHolds(square, { lat: 5, lon: 5 })).toBe(false);
		expect(geometryHolds(square, { lat: 11, lon: 2 })).toBe(false);
		expect(
			geometryHolds({ type: 'MultiPolygon', coordinates: [square.coordinates] }, { lat: 2, lon: 8 })
		).toBe(true);
	});

	it('never holds a point in a line, and measures the distance to it', () => {
		const line: Geometry = {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[0, 1]
			]
		};
		expect(geometryHolds(line, { lat: 0.5, lon: 0 })).toBe(false);
		expect(lineDistanceKm(line, { lat: 0.5, lon: 0 })).toBeCloseTo(0, 5);
		expect(lineDistanceKm(line, { lat: 0.5, lon: 0.01 })).toBeCloseTo(1.11, 1);
		expect(lineDistanceKm(line, { lat: 2, lon: 0 })).toBeCloseTo(111.19, 0);
		expect(lineDistanceKm(square, { lat: 0, lon: 0 })).toBeNull();
	});
});

describe('warningsAt, on recorded French warnings', () => {
	const { data } = warningsFromApi('FR', fixture('warnings-FR'));

	it('gives each Corsican town the warnings of its own department', () => {
		const bastia = warningsAt(data, BASTIA).here.map((h) => h.warning);
		const ajaccio = warningsAt(data, AJACCIO).here.map((h) => h.warning);
		expect(bastia.some((w) => w.area === 'Haute-Corse' && w.level === 'RED')).toBe(true);
		expect(bastia.every((w) => w.area === 'Haute-Corse')).toBe(true);
		expect(ajaccio.some((w) => w.area === 'Corse-du-Sud' && w.level === 'ORANGE')).toBe(true);
		expect(ajaccio.every((w) => w.area === 'Corse-du-Sud')).toBe(true);
	});

	it('counts a river section within 5 km, with its distance, and not one farther away', () => {
		const river = data.warnings.find((w) => w.shape && data.shapes[w.shape].type === 'MultiLineString')!;
		const [lon, lat] = (data.shapes[river.shape!] as { coordinates: number[][][] }).coordinates[0][0];
		const near = warningsAt(data, { lat: lat + 0.01, lon }).here.find((h) => h.warning.id === river.id);
		expect(near?.distanceKm).toBeGreaterThan(0);
		expect(near?.distanceKm).toBeLessThan(5);
		const far = warningsAt(data, { lat: lat + 1, lon }).here.find((h) => h.warning.id === river.id);
		expect(far).toBeUndefined();
	});

	it('gives a coastal town outside the simplified coast the areas within 2 km, with the distance', () => {
		const here = warningsAt(data, BASTIA).here;
		expect(here.length).toBeGreaterThan(0);
		for (const h of here) {
			expect(h.distanceKm).not.toBeNull();
			expect(h.distanceKm).toBeLessThanOrEqual(2);
		}
	});

	it('does not add the margin when an area holds the point', () => {
		const corte = warningsAt(data, { lat: 42.306, lon: 9.15 }).here;
		expect(corte.some((h) => h.warning.level === 'RED')).toBe(true);
		expect(corte.every((h) => h.distanceKm === null && h.warning.area === 'Haute-Corse')).toBe(true);
	});

	it('returns the warnings without a shape apart', () => {
		const { data: it } = warningsFromApi('IT', fixture('warnings-IT'));
		const { here, unplaced } = warningsAt(it, { lat: 41.9, lon: 12.5 });
		expect(unplaced.length).toBe(it.warnings.filter((w) => !w.shape).length);
		expect(here.every((h) => h.warning.shape)).toBe(true);
	});
});

describe('countriesNear and hazardsNear', () => {
	it('finds the covered countries around a point, and none in the open ocean', () => {
		const served = ['FR', 'IT', 'US'];
		expect(countriesNear(BASTIA, served)).toContain('FR');
		expect(countriesNear({ lat: 48.85, lon: 2.35 }, served)).toContain('FR');
		expect(countriesNear({ lat: 48.85, lon: 2.35 }, ['US'])).toEqual([]);
		expect(countriesNear({ lat: -40, lon: -120 }, served)).toEqual([]);
	});

	it('keeps the hazards within the radius, nearest first', () => {
		const { items } = hazardsFromApi(fixture('hazards'));
		const origin = { lat: items[0].lat, lon: items[0].lon };
		const near = hazardsNear(items, origin, 500);
		expect(near[0].hazard.id).toBe(items[0].id);
		expect(near.every((h) => h.distanceKm <= 500)).toBe(true);
		for (let i = 1; i < near.length; i++)
			expect(near[i].distanceKm).toBeGreaterThanOrEqual(near[i - 1].distanceKm);
	});
});

describe('circles', () => {
	it('draws a closed ring whose points are at the radius', () => {
		const ring = circleRing(BASTIA, 300);
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		for (const [lon, lat] of ring) expect(distanceKm(BASTIA, { lon, lat })).toBeCloseTo(300, 0);
	});

	it('frames the circle', () => {
		const [w, s, e, n] = circleBox(BASTIA, 300);
		for (const [lon, lat] of circleRing(BASTIA, 300)) {
			expect(lon).toBeGreaterThanOrEqual(w - 1e-9);
			expect(lon).toBeLessThanOrEqual(e + 1e-9);
			expect(lat).toBeGreaterThanOrEqual(s - 1e-9);
			expect(lat).toBeLessThanOrEqual(n + 1e-9);
		}
	});
});

describe('countryAt, on the simplified borders', () => {
	const borders = JSON.parse(
		readFileSync(join(process.cwd(), 'src', 'lib', 'data', 'borders.json'), 'utf-8')
	) as Borders;
	const cases: [string, number, number, string | null][] = [
		['Corte', 42.306, 9.15, 'FR'],
		['Bastia, on the coast', 42.697, 9.45, 'FR'],
		['Geneva', 46.204, 6.143, 'CH'],
		['Luxembourg', 49.611, 6.13, 'LU'],
		['Rome', 41.9, 12.5, 'IT'],
		['Denver', 39.74, -104.99, 'US'],
		['10 km off Nice', 43.62, 7.35, 'FR'],
		['Mexico City', 19.43, -99.13, 'MX'],
		['São Paulo', -23.55, -46.63, 'BR'],
		['Tokyo (a border, no source)', 35.68, 139.69, 'JP'],
		['Mid-Atlantic', 40, -40, null]
	];
	for (const [name, lat, lon, cc] of cases) {
		it(`puts ${name} in ${cc ?? 'no country'}`, () => {
			expect(countryAt(borders, { lat, lon })).toBe(cc);
		});
	}
});
