import { describe, expect, it } from 'vitest';
import {
	asPoint,
	cellKey,
	momentTime,
	moments,
	rainShown,
	readAt,
	TOWN_DAYS,
	TOWN_HOURS,
	townsFromApi,
	type TownWeather
} from './townWeather';

// 2026-11-28 10:20 UTC; the town is one hour ahead of UTC (11:20 there).
const NOW = Date.UTC(2026, 10, 28, 10, 20) / 1000;
const HOUR0 = Date.UTC(2026, 10, 28, 10) / 1000;

function apiPlace(over: Record<string, unknown> = {}) {
	return {
		lat: 48.85,
		lon: 2.35,
		utc_offset_s: 3600,
		weather_provider: 'Open-Meteo',
		fallback_used: false,
		current: { temp_c: 9.4, feels_like_c: 7, wind_kmh: 12, gust_kmh: 20, wind_deg: 250, weather_code: 3 },
		rain_nowcast: { interval_minutes: 15, mm_per_step: [0, 0, 0, 0], rain_expected_60m: false, max_mm_h: 0 },
		hourly: Array.from({ length: 48 }, (_, k) => ({
			time_utc: HOUR0 + k * 3600,
			temp_c: 9 + (k % 6),
			precipitation_mm: k >= 4 && k < 6 ? 0.5 : 0,
			precipitation_probability_pct: 10,
			wind_kmh: 10,
			wind_gust_kmh: k === 5 ? 60 : 20,
			wind_deg: 200,
			cloud_cover_pct: 50,
			weather_code: k >= 4 && k < 6 ? 61 : 2,
			is_day: true
		})),
		daily: ['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'].map((date, k) => ({
			date,
			code: k === 2 ? 63 : 1,
			tmin: 2 + k,
			tmax: 10 + k,
			rain_mm: k === 2 ? 8.4 : 0,
			rain_probability_pct: 20,
			wind_max: k === 3 ? 41 : 15
		})),
		...over
	};
}

function town(over: Record<string, unknown> = {}): TownWeather {
	const t = townsFromApi({ places: [apiPlace(over)] }).places[0];
	if (!t) throw new Error('no town');
	return t;
}

describe('townsFromApi', () => {
	it('reads the places of /v1/points as /v1/point, cut to what a pill and its card need', () => {
		const { places, attribution } = townsFromApi({
			places: [apiPlace(), apiPlace({ current: null, hourly: [], daily: [] })],
			attribution: 'Weather data by Open-Meteo.com'
		});
		expect(attribution).toBe('Weather data by Open-Meteo.com');
		expect(places[1]).toBeNull();
		const t = places[0]!;
		expect(t.current?.tempC).toBe(9.4);
		expect(t.current?.gustKmh).toBe(20);
		expect(t.hourly).toHaveLength(TOWN_HOURS);
		expect(t.daily).toHaveLength(TOWN_DAYS);
		expect(Object.keys(t.hourly[0]).sort()).toEqual(
			[
				't',
				'tempC',
				'feelsLikeC',
				'precipMm',
				'precipProbPct',
				'windKmh',
				'windGustKmh',
				'windDeg',
				'cloudCoverPct',
				'weatherCode',
				'isDay'
			].sort()
		);
		expect(t.daily[0]).toMatchObject({ date: '2026-11-28', tmaxC: 10, tminC: 2 });
	});

	it('gives an empty list for an answer that is not one', () => {
		expect(townsFromApi(null)).toEqual({ places: [], attribution: null });
		expect(townsFromApi({ places: 'x' })).toEqual({ places: [], attribution: null });
	});
});

describe('cellKey', () => {
	it('is the cell of the weather grid, the same for two points of a cell', () => {
		expect(cellKey({ lat: 48.8566, lon: 2.3522 })).toBe(cellKey({ lat: 48.86, lon: 2.36 }));
		expect(cellKey({ lat: 48.8566, lon: 2.3522 })).not.toBe(cellKey({ lat: 48.95, lon: 2.35 }));
	});
});

describe('moments', () => {
	it('are now, three coming hours, tomorrow morning and afternoon, the two days after', () => {
		const m = moments(NOW);
		expect(m.map((x) => x.kind)).toEqual(['now', 'hour', 'hour', 'hour', 'local', 'local', 'day', 'day']);
		// The next hour is 11:00 UTC: then +2, +5 and +8 hours after it.
		expect(m.slice(1, 4).map((x) => (x.kind === 'hour' ? x.t : null))).toEqual(
			[13, 16, 19].map((h) => Date.UTC(2026, 10, 28, h) / 1000)
		);
	});

	it('put tomorrow at 8 h at the town own clock', () => {
		// 8 h tomorrow in a town at UTC+1 is 7 h UTC.
		expect(momentTime({ kind: 'local', days: 1, hour: 8 }, NOW, 3600)).toBe(Date.UTC(2026, 10, 29, 7) / 1000);
		expect(momentTime({ kind: 'now' }, NOW, 3600)).toBe(HOUR0);
		expect(momentTime({ kind: 'day', days: 2 }, NOW, 3600)).toBeNull();
	});
});

describe('readAt', () => {
	it('reads now from the current conditions, the rain of the next 3 hours, no wind when it is weak', () => {
		const r = readAt(town(), { kind: 'now' }, NOW)!;
		expect(r).toMatchObject({ temp: 9.4, tempMin: null, rainMm: 0, wind: null, windDeg: 250, day: true });
		expect(rainShown(r)).toBe(false);
	});

	it('reads a coming hour from its hour: the rain and the strongest gust of the 3 hours from it', () => {
		const r = readAt(town(), { kind: 'hour', t: HOUR0 + 4 * 3600 }, NOW)!;
		expect(r.temp).toBe(9 + 4);
		expect(r.rainMm).toBeCloseTo(1);
		expect(rainShown(r)).toBe(true);
		expect(r.wind).toBe(60);
		expect(r.kind).toBe('pluie');
	});

	it('reads a day from the days, its highest and lowest, the strong mean wind', () => {
		const r = readAt(town(), { kind: 'day', days: 2 }, NOW)!;
		expect(r).toMatchObject({ temp: 12, tempMin: 4, rainMm: 8.4, wind: null });
		expect(readAt(town(), { kind: 'day', days: 3 }, NOW)?.wind).toBe(41);
	});

	it('gives nothing for a moment the forecast does not reach', () => {
		expect(readAt(town(), { kind: 'hour', t: HOUR0 + 60 * 3600 }, NOW)).toBeNull();
		expect(readAt(town({ daily: [] }), { kind: 'day', days: 2 }, NOW)).toBeNull();
	});
});

describe('asPoint', () => {
	it('fills the blocks a town does not have with nothing, for the helpers of the card', () => {
		const p = asPoint(town());
		expect(p.air).toBeNull();
		expect(p.hourly?.[0].dewPointC).toBeNull();
		expect(p.hourly?.[0].tempC).toBe(9);
	});
});
