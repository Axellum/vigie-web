import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WarningHere } from '../near';
import { pointFromApi } from '../transform';
import type { TvActivity } from '../tv/model';
import type { PointWeather, WarningSummary } from '../types';
import { parseWindBox, type WindPoint } from '../wind';
import {
	dayLabel,
	daysView,
	featured,
	frenchClock,
	gustForecast,
	nearestWind,
	phenomenonLabel,
	rainTone,
	rainView,
	RAIN_MAX_AGE_S,
	skyKind,
	tempColour,
	vigilanceView,
	windBox
} from './model';
import { parseWidgetParams, parseWidgetPlace } from './params';
import { WIDGET_TEXT, widgetText } from './text';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

// The recorded answer of `/v1/point` (Corsica): a dry hour, strong gusts forecast by AROME-PI.
const point = pointFromApi(fixture('point.json'));
const NOW = point.generated! + 60;

const withRain = (mmPerStep: number[], over: Partial<PointWeather> = {}): PointWeather => ({
	...point,
	...over,
	rain: { stepMinutes: 15, mmPerStep, expected60: null, maxMmH: null, attribution: null }
});

describe('the rain of the hour', () => {
	it('says there is none when every step is dry', () => {
		const view = rainView(point, NOW);
		expect(view.status).toBe('none');
		expect(view.bars).toHaveLength(4);
		expect(view.bars.every((b) => b.tone === 'dry')).toBe(true);
	});

	it('says when the rain comes, for how long and how hard', () => {
		// 0.6 mm in a quarter of an hour is 2.4 mm/h.
		const view = rainView(withRain([0, 0.1, 0.6, 0]), NOW);
		expect(view).toMatchObject({ status: 'soon', inMin: 15, forMin: 30, stepMinutes: 15 });
		expect(view.maxMmH).toBeCloseTo(2.4);
		expect(view.bars.map((b) => b.tone)).toEqual(['dry', 'light', 'rain', 'dry']);
		expect(view.bars[2].pct).toBeGreaterThan(view.bars[1].pct);
	});

	it('says it rains now when the first step is wet', () => {
		expect(rainView(withRain([1, 1, 0, 0]), NOW)).toMatchObject({ status: 'now', inMin: 0, forMin: 30 });
	});

	it('does not tell the hour from an old or stale reading', () => {
		expect(rainView(withRain([1, 0, 0, 0]), NOW + RAIN_MAX_AGE_S + 120).status).toBe('unknown');
		expect(rainView({ ...withRain([1, 0, 0, 0]), stale: true }, NOW).status).toBe('unknown');
		expect(rainView(withRain([1, 0, 0, 0], { provider: 'open-meteo (stale cache)' }), NOW).status).toBe(
			'unknown'
		);
		expect(rainView(null, NOW).status).toBe('unknown');
	});

	it('colours a rate with the three blues of the charter', () => {
		expect([0.5, 2, 6].map(rainTone)).toEqual(['light', 'rain', 'heavy']);
	});
});

const warning = (over: Partial<WarningSummary>): WarningHere => ({
	warning: {
		id: 'w',
		apiId: null,
		cc: 'FR',
		source: 'meteofrance',
		level: 'YELLOW',
		levelOriginal: null,
		phenomenon: 'wind',
		area: '64',
		sent: null,
		onset: null,
		expires: null,
		ends: null,
		shape: '64',
		texts: [],
		...over
	},
	river: false,
	distanceKm: null
});
const label = (w: WarningSummary) => w.phenomenon;

describe('the official warnings at the place', () => {
	it('names the highest level, its phenomena, when they end and how many others there are', () => {
		const here = [
			warning({ id: 'a', level: 'ORANGE', phenomenon: 'wind', ends: NOW + 3600 }),
			warning({ id: 'b', level: 'ORANGE', phenomenon: 'coastal', ends: NOW + 7200 }),
			warning({ id: 'c', level: 'YELLOW', phenomenon: 'thunderstorm' }),
			warning({ id: 'd', level: 'YELLOW', phenomenon: 'wind' })
		];
		expect(vigilanceView('warnings', here, label, NOW)).toEqual({
			state: 'warnings',
			level: 'ORANGE',
			labels: ['wind', 'coastal'],
			until: NOW + 7200,
			more: 1
		});
	});

	it('leaves out a warning that has ended', () => {
		const view = vigilanceView('warnings', [warning({ ends: NOW - 60 })], label, NOW);
		expect(view).toMatchObject({ state: 'none', level: null });
	});

	it('keeps the state of the place when nothing holds it', () => {
		expect(vigilanceView('nosource', [], label, NOW).state).toBe('nosource');
		expect(vigilanceView('loading', [], label, NOW).state).toBe('loading');
	});

	it('names a phenomenon with the site’s word, else with the issuer’s without its level', () => {
		const site = (p: string) => ({ wind: 'Vent' })[p] ?? null;
		const issuer = () => 'Vigilance jaune canicule';
		expect(phenomenonLabel(warning({}).warning, site, issuer)).toBe('Vent');
		expect(phenomenonLabel(warning({ phenomenon: 'other' }).warning, site, issuer)).toBe('Canicule');
	});
});

const station = (over: Partial<WindPoint>): WindPoint => ({
	id: 's',
	name: 'Station',
	lat: 43.47,
	lon: -1.53,
	altM: 70,
	kmh: 40,
	gustKmh: 70,
	fromDeg: 270,
	measured: NOW - 600,
	buoy: false,
	...over
});

describe('the wind measured near the place', () => {
	const place = { lat: 43.483, lon: -1.559 };

	it('takes the nearest fresh station below the summits', () => {
		const best = nearestWind(
			[
				station({ id: 'far', lat: 43.9, lon: -1.5 }),
				station({ id: 'summit', lat: 43.48, lon: -1.56, altM: 1200 }),
				station({ id: 'old', lat: 43.483, lon: -1.559, measured: NOW - 3 * 3600 }),
				station({ id: 'near' })
			],
			place,
			NOW
		);
		expect(best?.point.id).toBe('near');
		expect(best?.ageMin).toBe(10);
	});

	it('takes a summit when it is the only station near', () => {
		expect(nearestWind([station({ id: 'summit', altM: 1200 })], place, NOW)?.point.id).toBe('summit');
	});

	it('finds nothing farther than 25 km', () => {
		expect(nearestWind([station({ lat: 44, lon: -1 })], place, NOW)).toBeNull();
	});

	it('asks the site a box of whole degrees around the cell, which the site accepts', () => {
		const box = windBox({ lat: 43.5, lon: -1.55 });
		expect(box).toEqual([-2, 43, -1, 44]);
		expect(parseWindBox(box.join(','))).toEqual(box);
	});
});

describe('the rest of the place', () => {
	it('gives the gusts AROME-PI forecasts, and nothing once they are past', () => {
		expect(gustForecast(point, NOW)).toEqual({ kmh: 74, at: 1795007700 });
		expect(gustForecast(point, 1795007700 + 3600)).toBeNull();
		expect(gustForecast({ ...point, shortTerm: null }, NOW)).toBeNull();
	});

	it('lists the days from the place’s today', () => {
		const days = daysView(point, NOW, 5);
		expect(days.length).toBeGreaterThan(0);
		expect(days.length).toBeLessThanOrEqual(5);
		expect(days[0].date >= new Date((NOW + (point.utcOffsetS ?? 0)) * 1000).toISOString().slice(0, 10)).toBe(
			true
		);
	});

	it('names a day in a few letters', () => {
		expect(dayLabel('fr', '2026-11-22')).toBe('Dim');
		expect(dayLabel('en', '2026-11-22')).toBe('Sun');
	});

	it('draws a weather code', () => {
		expect([0, 2, 3, 45, 53, 63, 81, 73, 95, null].map(skyKind)).toEqual([
			'clear',
			'partly',
			'cloudy',
			'fog',
			'drizzle',
			'rain',
			'showers',
			'snow',
			'storm',
			'cloudy'
		]);
	});

	it('colours a temperature on the charter’s ramp', () => {
		expect(tempColour(-20, 'sky')).toBe('#8FC4FF');
		expect(tempColour(12, 'sky').toUpperCase()).toBe('#84E8A0');
		expect(tempColour(40, 'light')).toBe('#D0391E');
		expect(tempColour(6, 'dark')).toMatch(/^#[0-9a-f]{6}$/);
	});
});

describe('the surf spot', () => {
	const act = (id: TvActivity['id'], verdict: TvActivity['verdict'], available = true): TvActivity => ({
		id,
		available,
		verdict,
		slot: null,
		reason: null,
		chips: [],
		cells: [],
		marks: []
	});

	it('names the best activity, the first in the site’s order on a tie', () => {
		expect(featured([act('surf', 'poor'), act('kite', 'possible'), act('boat', 'possible')])?.id).toBe(
			'kite'
		);
		expect(featured([act('surf', 'good', false), act('kite', 'poor')])?.id).toBe('kite');
	});

	it('writes the times of the surf model as French sentences do', () => {
		expect(frenchClock('20:32')).toBe('20 h 32');
		expect(frenchClock('demain 11:00 – 14:00')).toBe('demain 11 h – 14 h');
	});
});

describe('the address of the widget', () => {
	it('reads the size, the theme and the spot, with defaults for anything else', () => {
		expect(parseWidgetParams(new URLSearchParams('size=LARGE&theme=light&spot=Anglet-Plage'))).toEqual({
			size: 'large',
			theme: 'light',
			spot: 'anglet-plage'
		});
		expect(parseWidgetParams(new URLSearchParams('size=huge&theme=pink&spot=../x'))).toEqual({
			size: 'medium',
			theme: 'sky',
			spot: null
		});
	});

	it('reads the place and its name after the #', () => {
		expect(parseWidgetPlace('#43.483,-1.559/Biarritz')).toEqual({
			lat: 43.483,
			lon: -1.559,
			name: 'Biarritz'
		});
		expect(parseWidgetPlace('#43.483,-1.559/Saint-Jean-de-Luz%20%C3%A9t%C3%A9')?.name).toBe(
			'Saint-Jean-de-Luz été'
		);
		expect(parseWidgetPlace('#43.483,-1.559')).toEqual({ lat: 43.483, lon: -1.559, name: null });
		expect(parseWidgetPlace('#43.483,-1.559/%E0')?.name).toBeNull();
		expect(parseWidgetPlace('#nowhere')).toBeNull();
		expect(parseWidgetPlace('')).toBeNull();
	});
});

describe('the words of the widget', () => {
	it('has every word in French and in English', () => {
		expect(Object.keys(WIDGET_TEXT.en).sort()).toEqual(Object.keys(WIDGET_TEXT.fr).sort());
	});

	it('fills its blanks', () => {
		expect(widgetText('fr', 'rainSoon', { n: 15 })).toBe('Pluie dans 15 min');
		expect(widgetText('en', 'measuredAt', { name: 'Biarritz', n: 12 })).toBe(
			'Measured at Biarritz · 12 min ago'
		);
	});
});
