import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	climateDay,
	climateFromApi,
	climateShown,
	gaugeAt,
	isCoveredClimateCountry,
	monthName,
	monthOf,
	stationName
} from './climate';

// The answer of the public API for Corte in October (e2e/fixtures/index.json says where it comes from).
const raw = JSON.parse(readFileSync('e2e/fixtures/climate-corte.json', 'utf8'));

describe('climate', () => {
	it('reads the answer of the API', () => {
		const c = climateFromApi(raw);
		expect(c?.status).toBe('available');
		expect(c?.month).toBe(10);
		expect(c?.station).toMatchObject({ name: 'CORTE (20)', altitudeM: 350, distanceKm: 3.8, active: true });
		expect(c?.normals?.tmax).toEqual({ value: 21.6, period: '1991-2020' });
		expect(c?.records?.tmax).toEqual({ value: 31, date: '2022-10-22', since: '2015-10-01' });
		expect(climateShown(c)).toBe(true);
	});

	it('shows nothing outside the sheets or for a malformed answer', () => {
		const outside = climateFromApi({ status: 'outside_coverage', month: 10, station: null, normals: null });
		expect(outside?.station).toBeNull();
		expect(climateShown(outside)).toBe(false);
		expect(climateFromApi({ status: 'nope', month: 10 })).toBeNull();
		expect(climateFromApi(null)).toBeNull();
		expect(isCoveredClimateCountry('fr')).toBe(true);
		expect(isCoveredClimateCountry('RE')).toBe(true);
		expect(isCoveredClimateCountry('ES')).toBe(false);
		expect(isCoveredClimateCountry(null)).toBe(false);
	});

	it('sets the day against the month, a record only at a station still measuring', () => {
		const c = climateFromApi(raw)!;
		expect(climateDay(c as never, 19.3, 15)).toEqual({ difference: -2.3, record: null });
		expect(climateDay(c as never, 32, 15)).toEqual({ difference: 10.4, record: 'heat' });
		expect(climateDay(c as never, 20, -1)?.record).toBe('cold');
		expect(climateDay(c as never, null, 15)).toBeNull();
		const stopped = { ...c, station: { ...c.station!, active: false } };
		expect(climateDay(stopped as never, 32, 15)?.record).toBeNull();
	});

	it('places a temperature on the gauge, from the cold record to the heat record', () => {
		const records = {
			tmin: { value: 0, date: null, since: null },
			tmax: { value: 30, date: null, since: null }
		};
		expect(gaugeAt(records, 15)).toBe(0.5);
		expect(gaugeAt(records, -5)).toBe(0);
		expect(gaugeAt(records, 40)).toBe(1);
		expect(gaugeAt(records, null)).toBeNull();
		expect(gaugeAt({ ...records, tmax: { value: null, date: null, since: null } }, 15)).toBeNull();
	});

	it('names the month and the station as a sentence wants them', () => {
		expect(monthName('fr', 10)).toBe('Octobre');
		expect(monthName('en', 10)).toBe('October');
		expect(monthOf('fr', 11)).toBe('de novembre');
		expect(monthOf('fr', 4)).toBe('d’avril');
		expect(monthOf('fr', 8)).toBe('d’août');
		expect(monthOf('en', 4)).toBe('April');
		expect(stationName('CORTE (20)')).toBe('Corte (20)');
		expect(stationName('ST-GIRONS')).toBe('St-Girons');
		expect(stationName('LE PUY-CHADRAC')).toBe('Le Puy-Chadrac');
		expect(stationName("PLOUMANAC'H")).toBe("Ploumanac'h");
		expect(stationName("L'ISLE-D'ABEAU")).toBe("L'Isle-d'Abeau");
	});
});
