import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activitiesFromApi } from '../activities';
import { surfForecastFromApi } from '../surf';
import { tidesFromApi } from '../tides';
import { pointFromApi } from '../transform';
import {
	beaufort,
	buildScreen,
	creditOf,
	heightAt,
	hourIndex,
	isDay,
	knots,
	rainView,
	RAIN_MAX_AGE_S,
	zoneOffsetS,
	type Fresh,
	type TvInput
} from './model';
import { TV_DEFAULTS, parseTvParams } from './params';
import { TV_TEXT, tvText } from './text';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

// The answers of the public API for Hossegor, read on 8 November 2026 at 11:06 in France (10:06 UTC).
const NOW = 1794132393;
const activities = activitiesFromApi(fixture('tv-activities-hossegor.json'))!;
const forecast = surfForecastFromApi(fixture('tv-surf-hossegor.json'))!;
const tide = tidesFromApi(fixture('tv-tides-hossegor.json'));
const sky = pointFromApi(fixture('point.json'));
const fresh = <T>(value: T, at = NOW * 1000): Fresh<T> => ({ value, stale: false, fetchedAt: at });

const input = (over: Partial<TvInput> = {}): TvInput => ({
	now: NOW,
	lang: 'fr',
	params: parseTvParams(new URLSearchParams('spot=tv-hossegor')),
	spot: activities.spot,
	activities: fresh(activities),
	forecast: fresh(forecast),
	tide: fresh(tide),
	sky: fresh(sky),
	...over
});

describe('the address of a screen', () => {
	it('falls back to the defaults for anything missing or wrong, never to an error', () => {
		const p = parseTvParams(
			new URLSearchParams('spot=../etc&preset=yacht&panels=nope&d=abc&theme=blue&r=1&reload=0')
		);
		expect(p).toEqual({
			spot: null,
			...TV_DEFAULTS,
			panels: [...TV_DEFAULTS.panels],
			refreshSeconds: 60,
			reloadHours: 1
		});
	});

	it('reads the spot, the preset, the panels in the order given, the durations and the theme', () => {
		const p = parseTvParams(
			new URLSearchParams(
				'spot=Soorts-Hossegor&preset=Club&panels=verdicts,cadran,verdicts&d=7&theme=night&r=120&reload=24'
			)
		);
		expect(p).toEqual({
			spot: 'soorts-hossegor',
			preset: 'club',
			panels: ['verdicts', 'cadran'],
			seconds: 7,
			theme: 'night',
			refreshSeconds: 120,
			reloadHours: 24
		});
	});

	it('keeps every duration within bounds', () => {
		const p = parseTvParams(new URLSearchParams('d=1&r=999999&reload=500'));
		expect([p.seconds, p.refreshSeconds, p.reloadHours]).toEqual([5, 3600, 48]);
	});
});

describe('units', () => {
	it('puts the wind in knots and in the force the API rules use (its knots rounded first)', () => {
		expect(knots(17.9)).toBeCloseTo(9.67, 2);
		expect(knots(null)).toBeNull();
		expect([0, 0.4, 0.9, 3.4, 3.5, 4, 11, 21.4, 21.6, 63.9, 64, 90].map(beaufort)).toEqual([
			0, 0, 1, 1, 2, 2, 4, 5, 6, 12, 12, 12
		]);
	});

	it('agrees with the force the API itself gave for the same hour', () => {
		const boat = activities.activities.find((a) => a.id === 'boat')!;
		const force = boat.detail!.criteria.find((c) => c.name === 'wind_force')!;
		const hour = forecast.hours[hourIndex(forecast.hours, boat.detail!.t)];
		expect(beaufort(knots(hour.wind.speed)!)).toBe(force.value);
	});

	it('gives the offset of the spots’ time zone, winter and summer', () => {
		expect(zoneOffsetS(NOW)).toBe(3600);
		expect(zoneOffsetS(Date.UTC(2026, 6, 1, 12) / 1000)).toBe(7200);
	});

	it('finds the hour that holds now, and none when the answer does not reach it', () => {
		const hours = forecast.hours;
		expect(hours[hourIndex(hours, NOW)].t).toBe(1794132000);
		expect(hourIndex(hours, hours[0].t - 1)).toBe(-1);
		expect(hourIndex(hours, hours[hours.length - 1].t + 3600)).toBe(-1);
	});

	it('reads the height of the tide between two points', () => {
		expect(
			heightAt(
				[
					[0, 1],
					[900, 2]
				],
				450
			)
		).toBe(1.5);
		expect(
			heightAt(
				[
					[0, 1],
					[900, 2]
				],
				901
			)
		).toBeNull();
	});
});

describe('the screen of a spot', () => {
	const s = buildScreen(input());

	it('says the wind of the hour in knots, with its force, its side and the hours to come', () => {
		expect(s.wind).toMatchObject({
			force: 3,
			word: 'petite brise',
			from: 'd’ESE',
			relative: 'vent de terre'
		});
		expect(Math.round(s.wind!.kn!)).toBe(10);
		expect(Math.round(s.wind!.gustKn!)).toBe(14);
		expect(s.wind!.bars).toHaveLength(12);
		expect(s.wind!.bars.filter((b) => b.label).map((b) => b.label)).toEqual(['11 h', '14 h', '17 h', '20 h']);
		expect(Math.max(...s.wind!.bars.map((b) => Math.max(b.pct, b.gustPct ?? 0)))).toBe(100);
	});

	it('says the swell of the hour', () => {
		expect(s.swell).toMatchObject({ m: 0.4, periodS: 7.9, from: 'NO' });
		expect(s.swell!.bars).toHaveLength(12);
	});

	it('says whether the tide rises, its next two extremes and the estimated coefficient, and draws 24 hours of it', () => {
		expect(s.tide!.trend).toBe('rising');
		expect(s.tide!.next.map((e) => `${e.kind} ${e.time}`)).toEqual(['high 15:51', 'low 21:51']);
		expect(s.tide!.coefficient).toBe(83);
		const curve = s.tide!.curve!;
		expect(curve.path.startsWith('M18.0,')).toBe(true);
		expect(curve.now!.x).toBeGreaterThan(0);
		expect(curve.now!.x).toBeLessThan(15);
		expect(curve.extremes.length).toBeGreaterThanOrEqual(3);
	});

	it('gives the four verdicts with a slot, the reason it is held back, the criteria chips and a strip of 24 hours', () => {
		expect(s.activities.map((a) => a.id)).toEqual(['surf', 'kite', 'boat', 'shore_fishing']);
		const boat = s.activities.find((a) => a.id === 'boat')!;
		expect(boat).toMatchObject({ verdict: 'good', slot: '11:00 – 18:00' });
		expect(boat.cells).toHaveLength(24);
		expect(boat.cells[0].now).toBe(true);
		expect(boat.marks).toEqual(['11 h', '23 h', '10 h']);
		const surf = s.activities.find((a) => a.id === 'surf')!;
		expect(surf.reason).toBe('Hauteur de la houle : trop petite');
		expect(surf.chips.length).toBeGreaterThan(0);
		expect(surf.chips.every((c) => c.name && c.value)).toBe(true);
		const fishing = s.activities.find((a) => a.id === 'shore_fishing')!;
		expect(fishing.slot).toMatch(/^demain /);
	});

	it('gives the sky, the sun, the day theme at 11:06 and the daylight windows', () => {
		expect(s.sky).toMatchObject({ label: 'Couvert', rise: '07:50', set: '17:47' });
		expect(s.theme).toBe('day');
		expect(s.windows.length).toBeGreaterThan(0);
		expect(s.offsetS).toBe(3600);
		expect(s.vigilance).toBe('none');
		expect(s.stale).toBe(false);
		expect(s.partial).toBe(false);
	});

	it('turns to night after the sunset, or when the address says so, and to day when it says so', () => {
		const later = buildScreen(input({ now: activities.sun[0].set + 600 }));
		expect(later.theme).toBe('night');
		expect(buildScreen(input({ params: { ...input().params, theme: 'night' } })).theme).toBe('night');
		expect(
			buildScreen(input({ now: activities.sun[0].set + 600, params: { ...input().params, theme: 'day' } }))
				.theme
		).toBe('day');
	});

	it('names the credits the API gave, once each and without web addresses', () => {
		expect(s.credit).toContain('Weather data by Open-Meteo.com');
		expect(s.credit).toContain('Tides computed by Vigie from the EOT20 ocean tide model');
		expect(s.credit).not.toMatch(/https?:/);
		expect(s.credit.match(/Open-Meteo/g)).toHaveLength(1);
		expect(s.credit).toContain('E.U. Copernicus Marine Service Information');
	});

	it('shows nothing it does not know: a part that did not answer is null, and the screen says it is partial', () => {
		const none = buildScreen(input({ forecast: null, tide: null, sky: null }));
		expect(none.wind).toBeNull();
		expect(none.swell).toBeNull();
		expect(none.tide).toBeNull();
		expect(none.partial).toBe(true);
		expect(none.sky).toMatchObject({ tempC: null, label: '–' });
		expect(none.activities).toHaveLength(4);
	});

	it('shows no instrument when the answers do not reach now, and calls old data old', () => {
		const old = buildScreen(input({ now: NOW + 5 * 86_400 }));
		expect(old.wind).toBeNull();
		expect(old.swell).toBeNull();
		expect(old.tide!.trend).toBeNull();
		expect(old.tide!.curve!.now).toBeNull();
		expect(old.activities.every((a) => a.slot === null)).toBe(true);
		expect(old.stale).toBe(true);
		expect(old.fresh).toBe(NOW);
	});

	it('is stale when the cache serves its last good answer', () => {
		expect(buildScreen(input({ tide: { value: tide, stale: true, fetchedAt: NOW * 1000 } })).stale).toBe(
			true
		);
	});

	it('does not show the French coefficient away from the French coasts', () => {
		const far = { ...activities.spot, lat: 36.0, lon: -5.4 };
		expect(buildScreen(input({ spot: far })).tide!.coefficient).toBeNull();
	});

	it('speaks English when asked', () => {
		const en = buildScreen(input({ lang: 'en' }));
		expect(en.wind!.word).toBe('gentle breeze');
		expect(en.wind!.from).toBe('from ESE');
		expect(en.sky!.label).toBe('Overcast');
	});
});

describe('day and night', () => {
	it('follows the daylight windows, then the daylight of the hour, and is day when it knows nothing', () => {
		const w: [number, number][] = [
			[100, 200],
			[300, 400]
		];
		expect(isDay(w, [], 150)).toBe(true);
		expect(isDay(w, [], 250)).toBe(false);
		expect(isDay(w, [], 350)).toBe(true);
		// Past the last window the sun is not known any more: the daylight of the hour decides, else it is day.
		expect(isDay(w, [{ t: 7200, daylight: false }], 500)).toBe(true);
		expect(isDay(w, [{ t: 0, daylight: false }], 500)).toBe(false);
		expect(isDay([], [{ t: 0, daylight: false }], 10)).toBe(false);
		expect(isDay([], [], 10)).toBe(true);
	});
});

describe('the rain of the hour', () => {
	const wet = (steps: number[], over: Partial<Fresh<ReturnType<typeof pointFromApi>>> = {}) => ({
		...fresh({
			...sky,
			rain: {
				stepMinutes: 15,
				mmPerStep: steps,
				expected60: steps.some((s) => s > 0.05),
				maxMmH: Math.max(...steps) * 4,
				attribution: 'Rain credit'
			}
		}),
		...over
	});

	it('says none for the recorded dry hour, with a flat low bar per step', () => {
		const r = rainView(fresh(sky), NOW);
		expect(r).toMatchObject({ status: 'none', level: null, maxMmH: 0 });
		expect(r.bars).toHaveLength(4);
		expect(r.bars.every((b) => !b.wet && b.pct < 10)).toBe(true);
	});

	it('names light, moderate and heavy rain by the strongest step as an hourly rate, with our thresholds', () => {
		// 0.1 mm in a step of 15 minutes is 0.4 mm/h; 0.5 is 2 mm/h; 0.7 is 2.8; 1.8 is 7.2; 1.9 is 7.6.
		expect(rainView(wet([0, 0.1, 0, 0]), NOW)).toMatchObject({ status: 'some', level: 'light', maxMmH: 0.4 });
		expect(rainView(wet([0, 0.5, 0, 0]), NOW).level).toBe('light');
		expect(rainView(wet([0, 0.7, 0, 0]), NOW).level).toBe('moderate');
		expect(rainView(wet([0, 1.8, 0, 0]), NOW).level).toBe('moderate');
		expect(rainView(wet([0, 1.9, 0, 0]), NOW)).toMatchObject({ level: 'heavy', maxMmH: 7.6 });
	});

	it('is dry when no step passes the 0.05 mm of the API, and shows a drop of rain as a stub at least', () => {
		expect(rainView(wet([0.05, 0, 0.02, 0]), NOW).status).toBe('none');
		const r = rainView(wet([0, 0.06, 5, 0]), NOW);
		expect(r.status).toBe('some');
		expect(r.bars.map((b) => b.wet)).toEqual([false, true, true, false]);
		expect(r.bars[1].pct).toBeGreaterThanOrEqual(14);
		expect(r.bars[2].pct).toBe(100);
	});

	it('follows the step length the API gives', () => {
		const point = {
			...sky,
			rain: {
				...sky.rain!,
				stepMinutes: 5,
				mmPerStep: [0, 0.5, 0, 0],
				expected60: true,
				maxMmH: 6,
				attribution: null
			}
		};
		expect(rainView(fresh(point), NOW).maxMmH).toBe(6);
	});

	it('does not know the rain when the API gave none, or the reading is stale or too old', () => {
		expect(rainView(null, NOW).status).toBe('unknown');
		expect(rainView(fresh({ ...sky, rain: null }), NOW).status).toBe('unknown');
		expect(rainView(fresh({ ...sky, rain: { ...sky.rain!, mmPerStep: null } }), NOW).status).toBe('unknown');
		expect(rainView(wet([0, 1, 0, 0], { stale: true }), NOW).status).toBe('unknown');
		expect(
			rainView(fresh({ ...wet([0, 1, 0, 0]).value, provider: 'Open-Meteo (stale cache)' }), NOW).status
		).toBe('unknown');
		const old = (age: number) => wet([0, 1, 0, 0], { fetchedAt: (NOW - age) * 1000 });
		expect(rainView(old(RAIN_MAX_AGE_S), NOW).status).toBe('some');
		expect(rainView(old(RAIN_MAX_AGE_S + 1), NOW).status).toBe('unknown');
	});

	it('is part of the screen, and its credit is in the credits', () => {
		const s = buildScreen(input({ sky: wet([0, 1, 0, 0]) }));
		expect(s.rain.status).toBe('some');
		expect(s.credit).toContain('Rain credit');
		expect(buildScreen(input({ sky: null })).rain.status).toBe('unknown');
	});
});

describe('the credits', () => {
	it('keeps the words, drops the addresses and the repeats', () => {
		expect(
			creditOf([
				'Weather data by Open-Meteo.com (https://open-meteo.com/) | Generated using X; https://doi.org/10.1/x',
				null,
				'Weather data by Open-Meteo.com (https://open-meteo.com/) | Tides by Vigie, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); rounded. Not for navigation'
			])
		).toBe(
			'Weather data by Open-Meteo.com · Generated using X · Tides by Vigie, CC BY 4.0; rounded. Not for navigation'
		);
	});
});

describe('the words', () => {
	it('has every word in both languages, and fills the blanks', () => {
		expect(Object.keys(TV_TEXT.en).sort()).toEqual(Object.keys(TV_TEXT.fr).sort());
		expect(tvText('fr', 'offline', { time: '11:06' })).toBe('hors ligne, dernière mise à jour 11:06');
		expect(tvText('en', 'range', { m: 3.4 })).toBe('range 3.4 m');
	});
});
