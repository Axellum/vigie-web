import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	curveGeometry,
	extremesShown,
	isTideTile,
	MAX_TIDE_TILES,
	midnights,
	nearestCoastPoint,
	showsFrenchCoefficient,
	tideLevel,
	tideLevelById,
	tideTileBox,
	tideTileFromApi,
	tideTilesInView,
	tidesFromApi
} from './tides';

// Real answers of the API (e2e/fixtures/index.json says which).
const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', `${name}.json`), 'utf-8'));
const level = (id: string) => tideLevelById(id)!;

describe('the tide of a point', () => {
	it('reads the curve, the extremes, the tide now and the estimated coefficients as the API gives them', () => {
		const raw = fixture('tides');
		const curve = tidesFromApi(raw);
		expect(curve.heights).toHaveLength(raw.heights.length);
		expect(curve.start).toBe(raw.heights[0].time_utc);
		expect(curve.end).toBe(raw.heights.at(-1).time_utc);
		expect(curve.cell).toEqual({ lat: raw.cell.lat, lon: raw.cell.lon, distanceKm: raw.cell.distance_km });
		expect(curve.extremes.map((e) => e.h)).toEqual(raw.extremes.map((e: { height_m: number }) => e.height_m));
		expect(curve.now?.trend).toBe(raw.now.trend);
		expect(curve.coefficients.map((c) => c.value)).toEqual(
			raw.coefficients_estimated.map((c: { value: number }) => c.value)
		);
		expect(curve.attribution).toBe(raw.attribution);
		expect(curve.limits).toBe(raw.limits);
	});

	it('leaves out what the API did not give, and refuses an answer without a curve', () => {
		const curve = tidesFromApi({
			heights: [
				{ time_utc: 200, height_m: 1 },
				{ time_utc: 100, height_m: 0.5 },
				{ time_utc: 300, height_m: null }
			],
			extremes: [
				{ time_utc: 150, kind: 'high', height_m: 1.2 },
				{ time_utc: 160, kind: 'slack' }
			],
			cell: { lat: 48, lon: -2 },
			now: { time_utc: 150, height_m: 1, trend: 'sideways' }
		});
		expect(curve.heights).toEqual([
			[100, 0.5],
			[200, 1]
		]);
		expect(curve.extremes).toEqual([{ t: 150, kind: 'high', h: 1.2, range: null }]);
		expect(curve.cell).toEqual({ lat: 48, lon: -2, distanceKm: null });
		expect(curve.now).toBeNull();
		expect(curve.model).toBeNull();
		expect(curve.attribution).toBeNull();
		expect(() => tidesFromApi({ heights: [{ time_utc: 1, height_m: 0 }] })).toThrow();
		expect(() => tidesFromApi(null)).toThrow();
	});

	it('shows only the extremes inside the window of the curve', () => {
		const curve = tidesFromApi({
			heights: [
				{ time_utc: 100, height_m: 0 },
				{ time_utc: 200, height_m: 1 }
			],
			extremes: [
				{ time_utc: 50, kind: 'low', height_m: -1 },
				{ time_utc: 150, kind: 'high', height_m: 1.1 },
				{ time_utc: 250, kind: 'low', height_m: -1 }
			]
		});
		expect(extremesShown(curve).map((e) => e.t)).toEqual([150]);
		const g = curveGeometry(curve, 100, 50, 10);
		expect(g.x(100)).toBe(0);
		expect(g.x(200)).toBe(100);
		// The extremes shown count in the scale (a refined high water can be above the curve's own points); the others do not.
		expect(g.low).toBe(0);
		expect(g.high).toBe(1.1);
		expect(g.y(1.1)).toBe(10);
		expect(g.y(0)).toBe(40);
		expect(g.path.startsWith('M0.0,')).toBe(true);
		expect(g.area.endsWith('Z')).toBe(true);
	});

	it('marks the midnights of the reader inside the window', () => {
		const day = 86400;
		// UTC: the one midnight between noon and noon the next day.
		expect(midnights(day / 2, day * 1.5, () => 0)).toEqual([day]);
		// Paris in winter (UTC+1, an offset of -60 minutes): midnight is 23:00 UTC.
		expect(midnights(day / 2, day * 1.5, () => -60)).toEqual([day - 3600]);
		expect(midnights(day + 60, day + 120, () => 0)).toEqual([]);
	});

	it('gives the French coefficient on the French coasts only', () => {
		expect(showsFrenchCoefficient(48.38, -4.5)).toBe(true); // Brest
		expect(showsFrenchCoefficient(48.65, -2.0)).toBe(true); // Saint-Malo
		expect(showsFrenchCoefficient(51.05, 2.35)).toBe(true); // Dunkerque
		expect(showsFrenchCoefficient(43.48, -1.56)).toBe(true); // Biarritz
		expect(showsFrenchCoefficient(50.37, -4.14)).toBe(false); // Plymouth
		expect(showsFrenchCoefficient(43.32, -1.98)).toBe(false); // San Sebastián
		expect(showsFrenchCoefficient(43.3, 5.37)).toBe(false); // Marseille
		expect(showsFrenchCoefficient(40.7, -74)).toBe(false); // New York
	});
});

describe('the tide along the coasts', () => {
	it('keeps for the map the height, the trend and the next waters of each point', () => {
		const raw = fixture('tides-coast');
		const tile = tideTileFromApi(raw);
		expect(tile.features.features).toHaveLength(raw.features.length);
		const first = raw.features[0].properties;
		expect(tile.features.features[0].properties).toEqual({
			h: first.height_m,
			up: first.trend === 'rising' ? 1 : 0,
			hi: first.next_high.time_utc,
			hh: first.next_high.height_m,
			lo: first.next_low.time_utc,
			lh: first.next_low.height_m
		});
		expect(tile.attribution).toBe(raw.metadata.attribution);
	});

	it('skips a point without its height or its trend, and leaves out a next water the API did not give', () => {
		const tile = tideTileFromApi({
			features: [
				{ geometry: { coordinates: [-2, 48] }, properties: { height_m: 1, trend: 'rising' } },
				{ geometry: { coordinates: [-2, 48] }, properties: { trend: 'rising' } },
				{ geometry: { coordinates: [-2, 48] }, properties: { height_m: 1, trend: 'slack' } },
				{ geometry: {}, properties: { height_m: 1, trend: 'falling' } }
			]
		});
		expect(tile.features.features.map((f) => f.properties)).toEqual([{ h: 1, up: 1 }]);
		expect(tile.attribution).toBeNull();
	});

	it('cuts the world in tiles, and asks only the latitudes the model covers', () => {
		expect(tideLevel(2).id).toBe('w');
		expect(tideLevel(6.4).id).toBe('w');
		expect(tideLevel(6.5).id).toBe('c');
		expect(tideLevelById('nope')).toBeNull();
		expect(tideTileBox(level('c'), 35, 27)).toEqual([-5, 45, 0, 50]);
		expect(isTideTile(level('c'), 71, 35)).toBe(true);
		expect(isTideTile(level('c'), 72, 0)).toBe(false);
		expect(isTideTile(level('w'), 0, 6)).toBe(false);
		expect(isTideTile(level('w'), 0.5, 0)).toBe(false);
		// Brittany, close: one tile of 5°.
		expect(tideTilesInView(level('c'), [-4.9, 46.1, -1.1, 49.9])).toEqual([[35, 27]]);
		// Beyond 66° N the model has nothing: the arctic rows are not asked.
		expect(tideTilesInView(level('w'), [-10, 60, 10, 89])).toEqual([
			[5, 5],
			[6, 5]
		]);
		expect(tideTilesInView(level('w'), [-10, 70, 10, 89])).toEqual([]);
		// Across the antimeridian, the longitudes are wrapped.
		expect(tideTilesInView(level('c'), [178, 0, 182, 4])).toEqual([
			[71, 18],
			[0, 18]
		]);
		expect(tideTilesInView(level('c'), [-180, -66, 180, 66])).toBeNull();
		expect(MAX_TIDE_TILES).toBeGreaterThan(0);
	});

	it('finds the coastal point nearest to the centre of a zone, inside it', () => {
		const point = (lon: number, lat: number) => ({
			type: 'Feature' as const,
			geometry: { type: 'Point' as const, coordinates: [lon, lat] },
			properties: {}
		});
		const features = [point(-2, 48.75), point(-1.5, 48.75), point(-3, 47)];
		const box: [number, number, number, number] = [-2.5, 48, -1, 49];
		expect(nearestCoastPoint(features, box, { lat: 48.7, lon: -1.6 })).toEqual({ lat: 48.75, lon: -1.5 });
		expect(nearestCoastPoint(features, [0, 0, 1, 1], { lat: 0.5, lon: 0.5 })).toBeNull();
	});
});
