import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pointFromApi } from './transform';
import type { PointWeather } from './types';
import {
	airPollutantKeys,
	aqiBand,
	areaPath,
	availableTabs,
	compareMetrics,
	directionGapDeg,
	mergePressureSeries,
	nearestMeasuredFromWindMap,
	nightRuns,
	polylinePath,
	pressureTrend,
	uvBand,
	type MeasuredComparison
} from './weatherCharts';

const pointFixture = (): PointWeather =>
	pointFromApi(JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'point.json'), 'utf-8')));

const sampleMeasured: MeasuredComparison = {
	sourceName: 'Calacuccia',
	kind: 'station',
	distanceKm: 11.2,
	altM: 811,
	measuredUtc: 1_792_528_200,
	windKmh: 15.8,
	gustKmh: 24.8,
	windFromDeg: 250,
	airTempC: 15.1,
	pressureHpa: 1010.2,
	attribution: 'Source: Météo-France'
};

describe('weatherCharts', () => {
	it('parses hourly, pressure_history and air_hourly from the point fixture and unlocks all tabs', () => {
		const point = pointFixture();
		expect(point.hourly?.length).toBe(48);
		expect(point.pressureHistory?.length).toBe(24);
		expect(point.airHourly?.length).toBe(48);
		expect(availableTabs(point, sampleMeasured, point.generated!)).toEqual([
			'meteogram',
			'barometer',
			'uv',
			'air',
			'compare'
		]);
		expect(availableTabs(point, null, point.generated!)).toEqual(['meteogram', 'barometer', 'uv', 'air']);
	});

	it('hides every tab gracefully when optional series and measured data are null', () => {
		const bare = pointFromApi({ coordinates: { lat: 48.85, lon: 2.35 }, daily: [] });
		expect(bare.hourly).toBeNull();
		expect(bare.pressureHistory).toBeNull();
		expect(bare.airHourly).toBeNull();
		expect(availableTabs(bare, null, 1_792_528_657)).toEqual([]);
	});

	it('shows only the tabs that have real non-null fields (e.g. MET Norway fallback)', () => {
		const metNo = pointFromApi({
			coordinates: { lat: 59.9, lon: 10.7 },
			daily: [],
			hourly: [
				{ time_utc: '2026-11-22T12:00:00Z', temp_c: 2.1, pressure_hpa: 1012.0, is_day: true },
				{ time_utc: '2026-11-22T13:00:00Z', temp_c: 2.4, pressure_hpa: 1013.5, is_day: true }
			]
		});
		expect(availableTabs(metNo, null, Date.parse('2026-11-22T12:00:00Z') / 1000)).toEqual([
			'meteogram',
			'barometer'
		]);
	});

	it('computes honest barometric trends (rising, steady, falling, null)', () => {
		const t0 = 1_795_000_000;
		const rising = mergePressureSeries(
			[
				{ t: t0 - 3 * 3600, pressureHpa: 1008.0 },
				{ t: t0, pressureHpa: 1010.2 }
			],
			null,
			t0
		);
		expect(pressureTrend(rising, t0)).toEqual({ kind: 'rising', deltaHpa: 2.2, hours: 3 });

		const falling = mergePressureSeries(
			[
				{ t: t0 - 3 * 3600, pressureHpa: 1015.0 },
				{ t: t0, pressureHpa: 1013.4 }
			],
			null,
			t0
		);
		expect(pressureTrend(falling, t0)).toEqual({ kind: 'falling', deltaHpa: -1.6, hours: 3 });

		const steady = mergePressureSeries(
			[
				{ t: t0 - 3 * 3600, pressureHpa: 1012.0 },
				{ t: t0, pressureHpa: 1012.4 }
			],
			null,
			t0
		);
		expect(pressureTrend(steady, t0)).toEqual({ kind: 'steady', deltaHpa: 0.4, hours: 3 });
		expect(pressureTrend([{ t: t0, pressureHpa: 1012, past: true }], t0)).toBeNull();
	});

	it('classifies WHO UV and EEA AQI bands cleanly', () => {
		expect([uvBand(0), uvBand(3), uvBand(6.5), uvBand(9), uvBand(11.5)]).toEqual([
			'low',
			'moderate',
			'high',
			'very_high',
			'extreme'
		]);
		expect([aqiBand(10), aqiBand(25), aqiBand(50), aqiBand(70), aqiBand(85), aqiBand(120)]).toEqual([
			'good',
			'fair',
			'moderate',
			'poor',
			'very_poor',
			'extremely_poor'
		]);
	});

	it('breaks SVG polylines and areas on null gaps without fabricating intermediate points', () => {
		const pts = [
			{ t: 0, v: 10 },
			{ t: 1, v: 20 },
			{ t: 2, v: null },
			{ t: 3, v: 30 },
			{ t: 4, v: 40 }
		];
		expect(
			polylinePath(
				pts,
				(p) => p.t,
				(p) => p.v,
				(t) => t * 10,
				(v) => 100 - v
			)
		).toBe('M0.0,90.0L10.0,80.0M30.0,70.0L40.0,60.0');
		expect(
			areaPath(
				pts,
				(p) => p.t,
				(p) => p.v,
				(t) => t * 10,
				(v) => 100 - v,
				100
			)
		).toBe('M0.0,100.0L0.0,90.0L10.0,80.0L10.0,100.0ZM30.0,100.0L30.0,70.0L40.0,60.0L40.0,100.0Z');
	});

	it('detects contiguous night spans, pollutants, and forecast-vs-measured gaps', () => {
		const point = pointFixture();
		const runs = nightRuns(point.hourly!);
		expect(runs.length).toBeGreaterThanOrEqual(2);
		expect(runs.every((r) => r.to > r.from)).toBe(true);
		expect(airPollutantKeys(point.airHourly!)).toEqual(['pm25', 'pm10', 'ozone', 'nitrogenDioxide', 'dust']);

		const rows = compareMetrics(point, sampleMeasured, point.generated!);
		expect(rows.map((r) => r.kind)).toEqual(['wind', 'gust', 'temp', 'pressure']);
		expect(rows[0].diff).toBe(12.3); // 15.8 - 3.5
		expect(directionGapDeg(350, 10)).toBe(20);
		expect(directionGapDeg(114, 250)).toBe(136);
		expect(directionGapDeg(null, 250)).toBeNull();
	});

	it('picks the nearest station within maxKm and returns null when none is nearby', () => {
		const windMap = {
			points: [
				{
					id: 'far',
					name: 'Far',
					lat: 48.8,
					lon: 2.3,
					altM: 50,
					kmh: 20,
					gustKmh: 30,
					fromDeg: 180,
					measured: 1000,
					buoy: false
				},
				{
					id: 'near',
					name: 'Calacuccia',
					lat: 42.33,
					lon: 9.02,
					altM: 811,
					kmh: 15.8,
					gustKmh: 24.8,
					fromDeg: 250,
					measured: 1000,
					buoy: false
				}
			],
			measured: 1000,
			stale: false,
			attribution: 'Source: Météo-France'
		};
		const found = nearestMeasuredFromWindMap({ lat: 42.306, lon: 9.15 }, windMap, 30);
		expect(found?.sourceName).toBe('Calacuccia');
		expect(found?.distanceKm).toBeLessThan(15);
		expect(nearestMeasuredFromWindMap({ lat: -23.55, lon: -46.63 }, windMap, 30)).toBeNull();
	});
});
