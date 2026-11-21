import { describe, expect, it } from 'vitest';
import {
	badgeRadius,
	declutter,
	gustShown,
	inBox,
	parseWindBox,
	stationName,
	windBadgeSvg,
	windFromBuoys,
	windQueryBox,
	windStationsFromApi,
	windStep,
	windValue,
	type WindPoint
} from './wind';
import { parseWindChoice } from './windLayer.svelte';
import type { SeaBuoy } from './sea/buoys';

const station = (over: Partial<WindPoint> = {}): WindPoint => ({
	id: '29155005',
	name: 'Ouessant-Stiff',
	lat: 48.47,
	lon: -5.06,
	altM: 64,
	kmh: 57.6,
	gustKmh: 72.7,
	fromDeg: 130,
	measured: 1_795_299_120,
	buoy: false,
	...over
});

describe('wind', () => {
	it('reads the stations of the API, and drops a station it cannot place', () => {
		const answer = windStationsFromApi({
			status: 'ok',
			stale: false,
			attribution: 'Source: Météo-France',
			stations: [
				{
					id: '29155005',
					name: 'OUESSANT-STIFF',
					alt_m: 64,
					lat: 48.47333,
					lon: -5.057,
					measured_utc: 1_795_299_120,
					wind_speed_kmh: 57.6,
					wind_gust_kmh: 72.7,
					wind_from_deg: 130
				},
				{ id: '1', name: null, lat: 45, lon: 2, measured_utc: 1, wind_speed_kmh: 3, wind_from_deg: null },
				{ id: '2', lat: null, lon: 2, measured_utc: 1, wind_speed_kmh: 3 }
			]
		});
		expect(answer?.points.map((p) => p.id)).toEqual(['29155005', '1']);
		expect(answer?.points[0]).toMatchObject({ name: 'Ouessant-Stiff', altM: 64, fromDeg: 130, buoy: false });
		expect(answer?.points[1]).toMatchObject({ name: null, fromDeg: null, gustKmh: null });
		expect(answer?.attribution).toBe('Source: Météo-France');
		expect(windStationsFromApi({ detail: 'Not Found' })).toBeNull();
	});

	it('writes the capital names of Météo-France as names', () => {
		expect(stationName('OUESSANT-STIFF')).toBe('Ouessant-Stiff');
		expect(stationName("PTE DE L'ARCOUEST")).toBe("Pte De L'Arcouest");
		expect(stationName('ÎLE D YEU')).toBe('Île D Yeu');
		expect(stationName(null)).toBeNull();
	});

	it('turns the buoys that measured a wind into squares of the map', () => {
		const buoy = {
			id: '62001',
			name: 'Gascogne',
			lat: 45.23,
			lon: -5.01,
			measured: 1,
			windKmh: 47.9,
			gustKmh: 60.8,
			windFromDeg: 240
		};
		const points = windFromBuoys([buoy as SeaBuoy, { ...buoy, id: 'x', windKmh: null } as SeaBuoy]);
		expect(points).toHaveLength(1);
		expect(points[0]).toMatchObject({ id: 'buoy-62001', buoy: true, kmh: 47.9, fromDeg: 240, altM: null });
	});

	it('reads only boxes of whole degrees, and asks a wider box than the view', () => {
		expect(parseWindBox('-7,40,11,53')).toEqual([-7, 40, 11, 53]);
		expect(parseWindBox('-7.5,40,11,53')).toBeNull();
		expect(parseWindBox('1,50,3,40')).toBeNull();
		expect(parseWindBox('-181,0,0,10')).toBeNull();
		expect(parseWindBox(null)).toBeNull();
		const asked = windQueryBox([-5.4, 41.3, 9.6, 51.1]);
		expect(asked.every(Number.isInteger)).toBe(true);
		expect(asked[0]).toBeLessThan(-5.4);
		expect(asked[3]).toBeGreaterThan(51.1);
		expect(windQueryBox([-179.5, -89.5, 179.5, 89.5])).toEqual([-180, -90, 180, 90]);
	});

	it('knows what is inside a box, across the antimeridian too', () => {
		expect(inBox([-6, 41, 10, 52], 48, -5)).toBe(true);
		expect(inBox([-6, 41, 10, 52], 16, -61)).toBe(false);
		expect(inBox([170, -30, -170, -10], -20, 175)).toBe(true);
		expect(inBox([170, -30, -170, -10], -20, -175)).toBe(true);
		expect(inBox([170, -30, -170, -10], -20, 0)).toBe(false);
	});

	it('colours by five steps and converts to knots', () => {
		expect([0, 19.9, 20, 35, 45, 60, 120].map(windStep)).toEqual([1, 1, 2, 3, 4, 5, 5]);
		expect(windValue(57.6, 'kmh')).toBe(58);
		expect(windValue(57.6, 'kn')).toBe(31);
	});

	it('writes the gust in small only when it is 15 km/h above the mean', () => {
		expect(gustShown(station())).toBe(true);
		expect(gustShown(station({ gustKmh: 70 }))).toBe(false);
		expect(gustShown(station({ gustKmh: null }))).toBe(false);
	});

	it('keeps the strongest where badges would touch, and leaves out what is off screen', () => {
		const pts = [
			station({ id: 'a', kmh: 10 }),
			station({ id: 'b', kmh: 40 }),
			station({ id: 'c', kmh: 20 }),
			station({ id: 'd', kmh: 90 })
		];
		const at: Record<string, [number, number] | null> = {
			a: [100, 100],
			b: [110, 105],
			c: [200, 100],
			d: null
		};
		const kept = declutter(pts, (p) => at[p.id], 10);
		expect(kept.map((k) => k.point.id)).toEqual(['b', 'c']);
		expect(badgeRadius(5)).toBeLessThan(badgeRadius(9));
	});

	it('draws a disc with the mean and a beak toward where the wind goes, a square for a buoy, no beak when calm', () => {
		const svg = windBadgeSvg(station(), 'kmh', 12);
		expect(svg).toContain('<circle');
		expect(svg).toContain('>58</text>');
		expect(svg).toContain('rotate(310 ');
		expect(svg).toContain('var(--wind-4)');
		expect(windBadgeSvg(station({ buoy: true }), 'kn', 12)).toContain('<rect');
		expect(windBadgeSvg(station({ fromDeg: null, kmh: 2 }), 'kmh', 12)).not.toContain('<path');
	});

	it('remembers the layer off and in km/h unless the browser kept another choice', () => {
		expect(parseWindChoice(null)).toEqual({ on: false, unit: 'kmh' });
		expect(parseWindChoice('{"on":true,"unit":"kn"}')).toEqual({ on: true, unit: 'kn' });
		expect(parseWindChoice('{"on":"yes","unit":"mph"}')).toEqual({ on: false, unit: 'kmh' });
		expect(parseWindChoice('not json')).toEqual({ on: false, unit: 'kmh' });
	});
});
