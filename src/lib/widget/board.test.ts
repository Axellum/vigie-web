import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pointFromApi } from '../transform';
import type { HourlyWeatherPoint, PointWeather } from '../types';
import {
	atNight,
	boardPalette,
	dayColumns,
	friseColumns,
	glow,
	hourSlots,
	pillWords,
	rainBars,
	rainFirst,
	rainNote,
	rainStrength,
	snowAt,
	tempColour,
	wmoKind
} from './board';
import { fmt, friseSvg, hourLabel, iconSvg } from './boardArt';
import { ICON_BOX, ICONS } from './familyIcons';
import type { VigilanceView } from './model';

const root = join(import.meta.dirname, '..', '..', '..');
const fixture = (name: string) => JSON.parse(readFileSync(join(root, 'e2e', 'fixtures', name), 'utf-8'));

// A place in Bordeaux (UTC+1 in November) at 14:10 local, with hours from 14:00 and a rain of the hour by PIAF.
const OFFSET = 3600;
const MIDNIGHT = Date.parse('2026-11-27T00:00:00Z') / 1000 - OFFSET;
const NOW = MIDNIGHT + 14 * 3600 + 10 * 60;

const hour = (i: number, over: Partial<HourlyWeatherPoint> = {}): HourlyWeatherPoint => ({
	t: MIDNIGHT + (14 + i) * 3600,
	tempC: 12 - i * 0.25,
	feelsLikeC: null,
	dewPointC: null,
	precipMm: i === 1 ? 0.4 : i === 2 ? 0.8 : 0,
	precipProbPct: i < 4 ? 60 : 10,
	windKmh: 20 + i,
	windGustKmh: 40 + i,
	windDeg: 250,
	cloudCoverPct: 80,
	cloudLowPct: null,
	cloudMidPct: null,
	cloudHighPct: null,
	pressureHpa: null,
	uvIndex: null,
	shortwaveWm2: null,
	weatherCode: i === 2 ? 61 : 3,
	isDay: 14 + i < 17 || 14 + i > 31,
	...over
});

const place = (over: Partial<PointWeather> = {}): PointWeather => {
	const base = pointFromApi(fixture('point.json'));
	return {
		...base,
		utcOffsetS: OFFSET,
		generated: NOW - 60,
		hourly: Array.from({ length: 30 }, (_, i) => hour(i)),
		daily: [
			'2026-11-26',
			'2026-11-27',
			'2026-11-28',
			'2026-11-29',
			'2026-11-30',
			'2026-12-01',
			'2026-12-02'
		].map((date, i) => ({
			date,
			code: [3, 61, 2, 0, 80, 3, 3][i],
			tminC: 4 + i,
			tmaxC: 11 + i,
			rainMm: [0, 6.5, 0.2, 0, 12, 0, 0][i],
			rainProbabilityPct: null,
			windMaxKmh: 30,
			uvMax: null
		})),
		rain: {
			stepMinutes: 15,
			mmPerStep: [0, 0.2, 0.4, 0.1],
			expected60: true,
			maxMmH: 2.5,
			attribution: 'Météo-France (PIAF)',
			// The first step started at 14:08: it is in progress, none is over.
			startUtc: MIDNIGHT + 14 * 3600 + 8 * 60,
			rate5mMmH: [0, 0, 0, 0, 0, 0, 0, 0, 0.4, 1.2, 2.5, 0.8]
		},
		...over
	};
};

describe('the icons of the family', () => {
	it('are the drawings of the Home Assistant card, the Meridien set', () => {
		const card = readFileSync(join(root, 'static', 'ha-card', 'vigie-card.js'), 'utf-8');
		const a = card.indexOf('const ICON_SETS = ');
		const b = card.indexOf('// </icons>');
		const literal = card
			.slice(a + 'const ICON_SETS = '.length, b)
			.trim()
			.replace(/;$/, '');
		const sets = new Function(`return (${literal});`)() as {
			meridien: { box: string; icons: Record<string, string> };
		};
		expect(ICON_BOX).toBe(sets.meridien.box);
		expect({ ...ICONS }).toEqual(sets.meridien.icons);
	});

	it('are coloured by the palette and get ids of their own for their masks', () => {
		const P = boardPalette('dark');
		const one = iconSvg(P, 'lune', 22),
			two = iconSvg(P, 'lune', 22);
		expect(one).toContain(`color="${P.icon.moon}"`);
		expect(one).not.toContain('@');
		const id = (s: string) => /mask id="([^"]+)"/.exec(s)?.[1];
		expect(id(one)).not.toBe(id(two));
		expect(iconSvg(P, null, 22)).toBe('');
	});
});

describe('the sky', () => {
	it('picks the icon of a weather code as the card does, and its night drawing', () => {
		expect(wmoKind(0)).toBe('soleil');
		expect(wmoKind(2)).toBe('eclaircies');
		expect(wmoKind(65)).toBe('pluie_forte');
		expect(wmoKind(81)).toBe('averses');
		expect(wmoKind(99)).toBe('orage_grele');
		expect(wmoKind(null)).toBeNull();
		expect(atNight('soleil', false)).toBe('lune');
		expect(atNight('pluie', false)).toBe('pluie');
		expect(atNight('soleil', true)).toBe('soleil');
		for (let code = 0; code <= 99; code++) {
			const kind = wmoKind(code);
			if (kind) expect(ICONS[kind]).toBeTruthy();
		}
	});

	it('tints a column grey to gold with its sun, navy at night', () => {
		const P = boardPalette('dark');
		const sunny = glow(P, 0.9, true),
			grey = glow(P, 0, true),
			dark = glow(P, null, false);
		expect(sunny).toHaveLength(3);
		expect(sunny[0].colour).not.toBe(grey[0].colour);
		expect(dark[0].colour).toContain('111,143,224');
	});

	it('colours a temperature on the ramp of the theme', () => {
		const P = boardPalette('dark');
		expect(tempColour(P, -20)).toBe(P.ramp[0]);
		expect(tempColour(P, 12)).toBe('#7be495');
		expect(tempColour(P, 50)).toBe(P.ramp[4]);
		expect(tempColour(boardPalette('light'), 50)).toBe('#D0391E');
	});
});

describe('the hours', () => {
	it('groups them by three from the current hour, as the card does', () => {
		const slots = hourSlots(place(), NOW, 3, 8);
		expect(slots).toHaveLength(8);
		expect(slots[0].ts).toBe(MIDNIGHT + 14 * 3600);
		expect(slots[0].temp).toBe(12);
		expect(slots[0].mm).toBeCloseTo(1.2);
		expect(slots[0].kind).toBe('pluie');
		expect(slots[0].chance).toBe(60);
		expect(slots[0].gust).toBe(42);
		expect(slots[0].deg).toBeCloseTo(250);
		expect(slots[1].day).toBe(false);
		expect(slots[1].sun).toBeNull();
	});

	it('gives six hour by hour, and none with fewer than four slots', () => {
		expect(hourSlots(place(), NOW, 1, 6)).toHaveLength(6);
		expect(hourSlots(place({ hourly: [hour(0), hour(1), hour(2)] }), NOW, 1, 6)).toEqual([]);
		expect(hourSlots(place({ hourly: null }), NOW, 3, 8)).toEqual([]);
	});

	it('writes the hours at the place, by its offset', () => {
		expect(hourLabel('fr', MIDNIGHT + 14 * 3600, OFFSET)).toBe('14 h');
		expect(hourLabel('en', MIDNIGHT + 14 * 3600, OFFSET)).toBe('14:00');
		expect(hourLabel('fr', MIDNIGHT + 14 * 3600 + 35 * 60, OFFSET)).toBe('14 h 35');
		expect(hourLabel('fr', MIDNIGHT + 14 * 3600, OFFSET, true)).toBe('14');
		expect(fmt('fr', 0.84, 1)).toBe('0,8');
		expect(fmt('en', 0.84, 1)).toBe('0.8');
		expect(fmt('fr', 12.4)).toBe('12');
	});
});

describe('the days', () => {
	it('start today at the place, the first one named so', () => {
		const days = dayColumns(place(), NOW, 'fr', 5);
		expect(days.map((d) => d.date)).toEqual([
			'2026-11-27',
			'2026-11-28',
			'2026-11-29',
			'2026-11-30',
			'2026-12-01'
		]);
		expect(days[0].name).toBe('Auj.');
		expect(days[1].name).toBe('Sam 28');
		expect(days[1].short).toBe('Sam');
		expect(dayColumns(place(), NOW, 'en', 5)[0].name).toBe('Today');
		expect(days[0].kind).toBe('pluie');
		expect(dayColumns(place({ daily: [] }), NOW, 'fr')).toEqual([]);
	});
});

describe('the rain of the hour', () => {
	it('reads the 5-minute rates from the start of the steps, and when the first rain comes', () => {
		const bars = rainBars(place(), NOW);
		expect(bars).toHaveLength(12);
		expect(bars[0].minutes).toBe(5);
		expect(bars[0].known).toBe(true);
		// The first wet step starts at 14:48: in 38 minutes.
		expect(rainFirst(bars, NOW)).toBe(38);
	});

	it('leaves out the steps already over, and counts from now when the answer does not say when they start', () => {
		const later = NOW + 20 * 60;
		expect(rainBars(place(), later)).toHaveLength(8);
		const older = place();
		older.rain = { ...older.rain!, startUtc: null, rate5mMmH: null };
		const bars = rainBars(older, NOW);
		expect(bars).toHaveLength(4);
		expect(bars[1].r).toBeCloseTo(0.8);
		expect(rainFirst(bars, NOW)).toBe(15);
	});

	it('says none for a dry hour and nothing without a nowcast', () => {
		const dry = place();
		dry.rain = { ...dry.rain!, rate5mMmH: new Array(12).fill(0) };
		expect(rainFirst(rainBars(dry, NOW), NOW)).toBe(-1);
		expect(rainFirst(rainBars(place({ rain: null }), NOW), NOW)).toBeNull();
	});
});

describe('the frise of the small widget', () => {
	it('says how strong the rain of the hour is, by the card’s thresholds', () => {
		expect(rainStrength(0.4)).toBe('light');
		expect(rainStrength(1)).toBe('moderate');
		expect(rainStrength(3)).toBe('heavy');
		expect(rainNote(place(), rainBars(place(), NOW), NOW)).toEqual({
			kind: 'strength',
			first: 'light',
			peak: 'moderate'
		});
	});

	it('after a dry hour, says when the next rain comes, from the hours after the nowcast', () => {
		const dry = place();
		dry.rain = { ...dry.rain!, rate5mMmH: new Array(12).fill(0) };
		// The nowcast ends at 15:08, the hour of 15:00 is wet: the next rain is said from the end of the hour, 15:10.
		expect(rainNote(dry, rainBars(dry, NOW), NOW)).toEqual({ kind: 'next', at: NOW + 3600 });
		// Without a nowcast, the hours alone.
		expect(rainNote(place({ rain: null }), [], NOW)).toEqual({ kind: 'next', at: NOW + 3600 });
	});

	it('says until when it stays dry, and nothing without any rain to read', () => {
		const dry = place({ hourly: Array.from({ length: 30 }, (_, i) => hour(i, { precipMm: 0 })) });
		dry.rain = { ...dry.rain!, rate5mMmH: new Array(12).fill(0) };
		expect(rainNote(dry, rainBars(dry, NOW), NOW)).toEqual({
			kind: 'dry',
			until: MIDNIGHT + 44 * 3600
		});
		expect(rainNote(place({ rain: null, hourly: null }), [], NOW)).toBeNull();
	});

	it('tells snow by the weather of its hour', () => {
		const snowy = place({ hourly: Array.from({ length: 30 }, (_, i) => hour(i, { weatherCode: 73 })) });
		expect(snowAt(snowy, NOW + 38 * 60)).toBe(true);
		expect(snowAt(place(), NOW + 38 * 60)).toBe(false);
	});

	it('follows the box of the hour with the next hours or the days from tomorrow', () => {
		const hours = friseColumns(place(), NOW, 'fr', 'hours', 5, true);
		expect(hours.map((x) => x.ts)).toEqual([15, 16, 17, 18, 19].map((h) => MIDNIGHT + h * 3600));
		expect(hours[0].mm).toBeCloseTo(0.4);
		expect(hours[0].low).toBeNull();
		const days = friseColumns(place(), NOW, 'fr', 'days', 5, true);
		expect(days.map((d) => d.name)).toEqual(['Sam', 'Dim', 'Lun', 'Mar', 'Mer']);
		expect(days[0]).toMatchObject({ high: 13, low: 6, mm: null });
		// Without a box, from now and from today.
		expect(friseColumns(place(), NOW, 'fr', 'hours', 6, false)[0].ts).toBe(MIDNIGHT + 14 * 3600);
		expect(friseColumns(place(), NOW, 'fr', 'days', 6, false)[0].name).toBe('Auj.');
		expect(friseColumns(place({ hourly: null, daily: [] }), NOW, 'fr', 'days', 5, true)).toEqual([]);
	});

	it('draws a column each, the rain of an hour under its temperature and a narrow day as its high over its low', () => {
		const P = boardPalette('dark');
		const hours = friseSvg(P, 'fr', friseColumns(place(), NOW, 'fr', 'hours', 5, true), 165, 70, {
			offsetS: OFFSET
		});
		expect(hours.match(/<rect [^>]*fill="url\(#/g)).toHaveLength(5);
		expect(hours).toContain(`>${hourLabel('fr', MIDNIGHT + 15 * 3600, OFFSET)}<`);
		expect(hours).toContain('>0,4<');
		const days = friseSvg(P, 'fr', friseColumns(place(), NOW, 'fr', 'days', 5, true), 165, 70, {
			offsetS: OFFSET
		});
		expect(days).toContain('>Sam<');
		expect(days).toContain('>13°<');
		expect(days).toContain('>6°<');
		expect(friseSvg(P, 'fr', [], 165, 70, { offsetS: 0 })).toBe('');
	});
});

describe('the pill of the warning', () => {
	const view = (over: Partial<VigilanceView>): VigilanceView => ({
		state: 'warnings',
		level: 'YELLOW',
		labels: ['Vent'],
		until: null,
		more: 0,
		...over
	});

	it('names the phenomenon and its level, and the others as +n', () => {
		expect(pillWords('fr', view({}))).toBe('Vent jaune');
		expect(pillWords('en', view({ labels: ['Wind'] }))).toBe('Yellow wind');
		expect(pillWords('fr', view({ level: 'ORANGE', labels: ['Vent', 'Orages'], more: 1 }))).toBe(
			'Vent orange +2'
		);
		expect(pillWords('fr', view({ labels: [] }))).toBe('Vigilance jaune');
		expect(pillWords('fr', view({ labels: ['Avalanches'] }), true)).toBe('Avalanches');
		expect(pillWords('en', view({ labels: ['Wind', 'Storms'] }), true)).toBe('Wind +1');
		expect(pillWords('fr', view({ state: 'none', level: null, labels: [] }))).toBeNull();
	});
});
