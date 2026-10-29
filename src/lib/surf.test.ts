import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	band,
	compass,
	criterionValue,
	hoursByDay,
	nearSurfSpots,
	ruleText,
	share,
	slotLabel,
	spotsAround,
	surfForecastFromApi,
	surfOverviewFromApi,
	surfSpotsFromApi,
	swellText
} from './surf';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

describe('the surf spots', () => {
	const spots = surfSpotsFromApi(fixture('surf-spots.json'));

	it('reads every spot of the API, north to south, with its credit', () => {
		expect(spots.spots.length).toBe(fixture('surf-spots.json').spots.length);
		expect(spots.spots[0].lat).toBeGreaterThan(spots.spots.at(-1)!.lat);
		expect(spots.attribution).toContain('OpenStreetMap');
	});

	it('leaves out a spot without a position or a facing, never filling it in', () => {
		const read = surfSpotsFromApi({
			spots: [
				{ id: 'a', name: 'A', lat: 44, lon: -1.2, facing_deg: 280, place: null },
				{ id: 'b', name: 'B', lat: 44, lon: -1.2 }
			]
		});
		expect(read.spots.map((s) => s.id)).toEqual(['a']);
		expect(read.spots[0].place).toBeNull();
		expect(read.attribution).toBeNull();
	});
});

describe('the forecast of a spot', () => {
	const raw = fixture('surf-hossegor.json');
	const f = surfForecastFromApi(raw)!;

	it('keeps the hours, the best slot, the rules and the credit the API gave', () => {
		expect(f.spot.id).toBe('soorts-hossegor-plage-sud-point-d-or');
		expect(f.hours.length).toBe(raw.hours.length);
		expect(f.best?.t).toBe(raw.best_slot.time_utc);
		expect(f.best?.rating.points).toBe(raw.best_slot.rating.points);
		expect(f.rules.swell_height).toBe(raw.rules.swell_height);
		expect(f.attribution).toContain('Copernicus');
	});

	it('says a criterion it could not score is not counted, with no points made up', () => {
		const tide = f.best!.rating.criteria.find((c) => c.name === 'tide')!;
		expect(tide.points).toBeNull();
		expect(f.best!.rating.unknown).toContain('tide');
	});

	it('keeps a missing value unknown', () => {
		const one = surfForecastFromApi({
			generated_utc: 1,
			spot: { id: 'a', name: 'A', lat: 44, lon: -1.2, facing_deg: 280 },
			hours: [{ time_utc: 3600, swell: { height_m: null }, wind: {}, secondary_swell: {} }]
		})!;
		const h = one.hours[0];
		expect(h.swell.height).toBeNull();
		expect(h.wind.relative).toBeNull();
		expect(h.tide).toBeNull();
		expect(h.rating).toBeNull();
		expect(h.daylight).toBeNull();
		expect(one.best).toBeNull();
		expect(swellText('fr', h.swell)).toBeNull();
	});

	it('shows the daylight hours by day, and the night ones on demand', () => {
		const day = hoursByDay(f.hours).flatMap((d) => d.hours);
		expect(day.every((h) => h.daylight !== false)).toBe(true);
		expect(hoursByDay(f.hours, true).flatMap((d) => d.hours).length).toBe(f.hours.length);
	});

	it('refuses an answer without a spot', () => {
		expect(surfForecastFromApi({ generated_utc: 1, hours: [] })).toBeNull();
	});
});

describe('the words and figures', () => {
	it('names the 16 points of the compass in each language', () => {
		expect(compass('fr', 280)).toBe('O');
		expect(compass('en', 300)).toBe('WNW');
		expect(compass('fr', 359)).toBe('N');
	});

	it('writes a criterion with its unit', () => {
		expect(criterionValue('fr', { name: 'swell_height', value: 1.16, unit: 'm', points: 2, max: 2 })).toBe(
			'1,2 m'
		);
		expect(criterionValue('en', { name: 'swell_direction', value: 8, unit: 'deg', points: 2, max: 2 })).toBe(
			'8°'
		);
		expect(
			criterionValue('fr', { name: 'wind', value: null, unit: 'km/h', points: null, max: 2 })
		).toBeNull();
	});

	it('gives a share only when something could be scored', () => {
		expect(share({ points: 6, outOf: 8 })).toBe(0.75);
		expect(share({ points: 0, outOf: 0 })).toBeNull();
		expect(share(null)).toBeNull();
	});

	it('links a tide to the surf only on the coasts of the spots', () => {
		expect(nearSurfSpots({ lat: 43.66, lon: -1.44 })).toBe(true);
		expect(nearSurfSpots({ lat: 43.3, lon: 5.37 })).toBe(false);
		expect(nearSurfSpots(null)).toBe(false);
	});
});

describe('the rules of the rating', () => {
	const rules = surfForecastFromApi(fixture('surf-hossegor.json'))!.rules;

	it('are in French on the French page while the API says what was translated', () => {
		expect(ruleText('fr', rules, 'swell_period')).toBe('sous 8 s : 0 ; de 8 à 11 s : 1 ; 11 s et plus : 2');
		expect(ruleText('en', rules, 'swell_period')).toBe(rules.swell_period);
		for (const name of ['swell_height', 'swell_direction', 'wind', 'tide', 'best_slot'] as const)
			expect(ruleText('fr', rules, name)).not.toBe(rules[name]);
	});

	it("are the API's own words once the API changes one", () => {
		const changed = { ...rules, swell_period: 'under 9 s: 0; 9 to 12 s: 1; 12 s and over: 2' };
		expect(ruleText('fr', changed, 'swell_period')).toBe(changed.swell_period);
		expect(ruleText('fr', {}, 'wind')).toBeNull();
	});
});

describe('every spot at once', () => {
	const raw = fixture('surf-overview.json');
	const overview = surfOverviewFromApi(raw)!;

	it('reads every spot, north to south, with its current hour and best slot as the API gives them', () => {
		expect(overview.spots.length).toBe(raw.spots.length);
		expect(overview.spots[0].lat).toBeGreaterThan(overview.spots.at(-1)!.lat);
		const api = raw.spots.find((s: { id: string }) => s.id === 'soorts-hossegor-plage-sud-point-d-or');
		const hossegor = overview.spots.find((s) => s.id === api.id)!;
		expect(hossegor.now?.t).toBe(api.now.time_utc);
		expect(hossegor.now?.swell.height).toBe(api.now.swell.height_m);
		expect(hossegor.now?.wind.relative).toBe(api.now.wind.relative);
		expect(hossegor.now?.rating).toEqual({
			points: api.now.rating.points,
			outOf: api.now.rating.out_of,
			unknown: api.now.rating.unknown
		});
		expect(hossegor.best).toEqual({
			t: api.best_slot.time_utc,
			points: api.best_slot.points,
			outOf: api.best_slot.out_of
		});
		expect(overview.attribution).toContain('OpenStreetMap');
		expect(overview.spots.some((s) => s.name === 'Plage de la Marbella')).toBe(true);
	});

	it('keeps a spot the wave model gave nothing for, with nothing made up', () => {
		const read = surfOverviewFromApi({
			generated_utc: 1,
			spots: [{ id: 'a', name: 'A', lat: 44, lon: -1.2, facing_deg: 270, now: null, best_slot: null }]
		})!;
		expect(read.spots[0].now).toBeNull();
		expect(read.spots[0].best).toBeNull();
		expect(surfOverviewFromApi({ generated_utc: 1, spots: [] })).toBeNull();
		expect(surfOverviewFromApi(null)).toBeNull();
	});

	it('picks the spots within the radius, the nearest first', () => {
		const biarritz = { lat: 43.4832, lon: -1.5586 };
		const around = spotsAround(overview.spots, biarritz, 30, 5);
		expect(around.length).toBe(5);
		expect(around.every((s) => s.km <= 30)).toBe(true);
		expect(around.map((s) => s.km)).toEqual([...around.map((s) => s.km)].sort((a, b) => a - b));
		expect(spotsAround(overview.spots, { lat: 45.76, lon: 4.84 }, 100)).toEqual([]); // Lyon
		expect(spotsAround(overview.spots, biarritz, null).length).toBe(overview.spots.length);
	});

	it('colours a rating by its share of the points', () => {
		expect(band({ points: 8, outOf: 8 })).toBe(3);
		expect(band({ points: 6, outOf: 8 })).toBe(3);
		expect(band({ points: 5, outOf: 8 })).toBe(2);
		expect(band({ points: 2, outOf: 8 })).toBe(1);
		expect(band({ points: 1, outOf: 8 })).toBe(0);
		expect(band({ points: 0, outOf: 0 })).toBeNull();
		expect(band(null)).toBeNull();
	});

	it('says a slot in the spots time zone', () => {
		expect(slotLabel('fr', 1793451600)).toBe('sam. 14:00'); // 2026-10-31 13:00 UTC, winter time
		expect(slotLabel('en', 1793451600)).toBe('Sat 14:00');
	});
});
