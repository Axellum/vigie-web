import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SharedPage } from '../server/pageLinks';
import type { Borders } from '../near';
import { auroraFromApi } from '../sky';
import { surfOverviewFromApi } from '../surf';
import { tidesFromApi } from '../tides';
import { hazardsFromApi, pointFromApi, warningsFromApi } from '../transform';
import { DEFAULT_UNITS } from '../units';
import type { Fresh } from './model';
import { parseTvParams } from './params';
import {
	buildShared,
	clockAt,
	dateAt,
	drawnBlocks,
	isTvCard,
	MAX_PANELS,
	TV_CARDS,
	type Reading,
	type SharedInput
} from './shared';
import { TV_TEXT } from './text';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

// Answers of the public API for the spot of Hossegor, read on 8 November 2026 at 11:06 in France (10:06 UTC): the weather with the
// sea (the clock of the place is UTC+1), and the weather of another position with no sea (UTC+2, as the fixture says).
const NOW = 1794132393;
const point = pointFromApi(fixture('tv-point-hossegor.json'));
const inland = pointFromApi(fixture('point.json'));
const tide = tidesFromApi(fixture('tv-tides-hossegor.json'));
const fresh = <T>(value: T, at = NOW * 1000): Fresh<T> => ({ value, stale: false, fetchedAt: at });

const BEACH = { name: 'Plage Sud', lat: 43.6601, lon: -1.4448, radiusKm: 25, profile: null } as const;
const block = (id: string, type: SharedPage['blocks'][number]['type'], name = BEACH.name) => ({
	id,
	type,
	size: 'm' as const,
	place: { ...BEACH, name }
});
const page = (...blocks: SharedPage['blocks']): SharedPage => ({
	title: 'Ma page',
	blocks,
	units: DEFAULT_UNITS,
	lang: 'fr'
});
const input = (
	p: SharedPage,
	readings: Record<string, Reading>,
	over: Partial<SharedInput> = {}
): SharedInput => ({
	now: NOW,
	lang: 'fr',
	params: parseTvParams(new URLSearchParams()),
	page: p,
	readings: new Map(Object.entries(readings)),
	...over
});
const all: Reading = { point: fresh(point), tide: fresh(tide) };

describe('what a screen draws of a page', () => {
	it('draws all eight cards of a personal page', () => {
		expect([...TV_CARDS]).toEqual(['official', 'hazards', 'weather', 'surf', 'sea', 'tide', 'sky', 'air']);
		for (const card of TV_CARDS) expect(isTvCard(card)).toBe(true);
	});

	it('keeps the order of the page and stops at twelve panels', () => {
		const p = page(
			block('aaaa0001', 'tide'),
			block('aaaa0002', 'official'),
			block('aaaa0003', 'weather'),
			block('aaaa0004', 'surf'),
			block('aaaa0005', 'air')
		);
		expect(drawnBlocks(p).map((b) => b.id)).toEqual([
			'aaaa0001',
			'aaaa0002',
			'aaaa0003',
			'aaaa0004',
			'aaaa0005'
		]);

		const many = page(
			...Array.from({ length: 24 }, (_, i) => block(`bbbb${String(i).padStart(4, '0')}`, 'weather'))
		);
		expect(drawnBlocks(many)).toHaveLength(MAX_PANELS);
		expect(drawnBlocks(many)[0].id).toBe('bbbb0000');
	});
});

describe('the panels', () => {
	const p = page(
		block('aaaa0001', 'weather'),
		block('aaaa0002', 'sea'),
		block('aaaa0003', 'tide'),
		block('aaaa0004', 'air')
	);
	const screen = buildShared(input(p, { aaaa0001: all, aaaa0002: all, aaaa0003: all, aaaa0004: all }));

	it('is one panel per block, in order, named after the place and the card', () => {
		expect(screen.title).toBe('Ma page');
		expect(screen.panels.map((x) => [x.id, x.card, x.place])).toEqual([
			['aaaa0001', 'weather', 'Plage Sud'],
			['aaaa0002', 'sea', 'Plage Sud'],
			['aaaa0003', 'tide', 'Plage Sud'],
			['aaaa0004', 'air', 'Plage Sud']
		]);
	});

	it('weather: the figures of the API, the wind in knots, the sun of the place at its own clock', () => {
		const w = screen.panels[0];
		if (w.card !== 'weather') throw new Error('not a weather panel');
		expect(w.sky?.tempC).toBe(point.current?.tempC);
		expect(w.sky?.feelsC).toBe(point.current?.feelsLikeC);
		expect(w.sky?.waterC).toBeNull(); // the sea has its own card
		// The sun comes from the equation of sun.ts, at the clock of the place (UTC+1): 07:50 to 17:48 in Hossegor in November.
		expect(w.sky?.rise).toMatch(/^0[67]:\d\d$/);
		expect(w.sky?.set).toMatch(/^1[78]:\d\d$/);
		expect(w.wind?.kn).toBeCloseTo((point.current!.windKmh as number) / 1.852, 5);
		expect(w.wind?.gustKn).toBeCloseTo((point.current!.gustKmh as number) / 1.852, 5);
		expect(w.wind?.bars).toEqual([]); // the API gives no hours here: no bars drawn from nothing
		expect(w.rain.status).toBe('none');
	});

	it('sea: the swell when the API separates it, else the waves; the temperature is the model value', () => {
		const s = screen.panels[1];
		if (s.card !== 'sea') throw new Error('not a sea panel');
		expect(s.swell).toMatchObject({ m: point.marine!.swellM, periodS: point.marine!.swellPeriodS });
		expect(s.waves).toBe(false);
		expect(s.waterC).toBe(point.marine!.seaTempC);

		const noSwell = { ...point, marine: { ...point.marine!, swellM: null } };
		const waves = buildShared(
			input(page(block('aaaa0002', 'sea')), { aaaa0002: { point: fresh(noSwell), tide: null } })
		).panels[0];
		if (waves.card !== 'sea') throw new Error('not a sea panel');
		expect(waves.waves).toBe(true);
		expect(waves.swell?.m).toBe(point.marine!.waveM);
	});

	it('sea inland: nothing is made up', () => {
		const s = buildShared(
			input(page(block('aaaa0002', 'sea')), { aaaa0002: { point: fresh(inland), tide: null } })
		).panels[0];
		if (s.card !== 'sea') throw new Error('not a sea panel');
		expect(s.swell).toBeNull();
		expect(s.waterC).toBeNull();
	});

	it('tide: the times are those of the place, not of the spots of the surf pages', () => {
		const t = screen.panels[2];
		if (t.card !== 'tide') throw new Error('not a tide panel');
		const first = tide.extremes.find((e) => e.t > NOW)!;
		expect(t.tide?.next[0]).toEqual({ kind: first.kind, time: clockAt(first.t, 3600) });
		// The same extreme at the clock of another place says another hour.
		const elsewhere = buildShared(
			input(page(block('aaaa0003', 'tide')), {
				aaaa0003: { point: fresh(inland), tide: fresh(tide) }
			})
		).panels[0];
		if (elsewhere.card !== 'tide') throw new Error('not a tide panel');
		expect(elsewhere.tide?.next[0].time).toBe(clockAt(first.t, 7200));
	});

	it('tide without the clock of the place: the times are dashes, not the hours of a wrong zone', () => {
		const t = buildShared(
			input(page(block('aaaa0003', 'tide')), { aaaa0003: { point: null, tide: fresh(tide) } })
		).panels[0];
		if (t.card !== 'tide') throw new Error('not a tide panel');
		expect(t.tide?.next.map((n) => n.time)).toEqual(['–', '–']);
	});

	it('tide inland: no curve, said as no data', () => {
		const t = buildShared(
			input(page(block('aaaa0003', 'tide')), { aaaa0003: { point: fresh(inland), tide: null } })
		).panels[0];
		if (t.card !== 'tide') throw new Error('not a tide panel');
		expect(t.tide).toBeNull();
	});

	it('air: the index and the particles as the API gave them, no word added', () => {
		const a = screen.panels[3];
		if (a.card !== 'air') throw new Error('not an air panel');
		expect(a.air).toEqual({ eaqi: point.air!.eaqi, pm25: point.air!.pm25, pm10: point.air!.pm10 });
		const none = buildShared(
			input(page(block('aaaa0004', 'air')), {
				aaaa0004: { point: fresh({ ...point, air: null }), tide: null }
			})
		).panels[0];
		if (none.card !== 'air') throw new Error('not an air panel');
		expect(none.air).toBeNull();
	});
});

describe('the clock, the day and the night', () => {
	const p = page(block('aaaa0001', 'weather'));
	const reading = { aaaa0001: { point: fresh(point), tide: null } };

	it('runs at the clock of the first place that gave one, and is empty when none did', () => {
		expect(buildShared(input(p, reading)).offsetS).toBe(3600);
		expect(buildShared(input(p, { aaaa0001: { point: null, tide: null } })).offsetS).toBeNull();
		const two = page(block('aaaa0001', 'weather'), block('aaaa0002', 'weather'));
		const s = buildShared(
			input(two, { aaaa0001: { point: null, tide: null }, aaaa0002: { point: fresh(inland), tide: null } })
		);
		expect(s.offsetS).toBe(7200);
	});

	it('follows the sun of the first place; the address can fix it', () => {
		expect(buildShared(input(p, reading)).theme).toBe('day'); // 11:06 in France
		const midnight = Date.UTC(2026, 10, 8, 23, 30) / 1000;
		expect(buildShared(input(p, reading, { now: midnight })).theme).toBe('night');
		const fixed = parseTvParams(new URLSearchParams('theme=night'));
		expect(buildShared(input(p, reading, { params: fixed })).theme).toBe('night');
		const s = buildShared(input(p, reading));
		expect(s.windows.length).toBeGreaterThanOrEqual(3);
		expect(s.windows.some(([rise, set]) => NOW >= rise && NOW < set)).toBe(true);
	});

	it('writes the time and the date at the place', () => {
		expect(clockAt(NOW, 3600)).toBe('11:06');
		expect(clockAt(NOW, 7200)).toBe('12:06');
		expect(clockAt(NOW, -5 * 3600)).toBe('05:06');
		expect(dateAt('fr', NOW, 3600)).toBe('dimanche 8 novembre');
		expect(dateAt('en', NOW, 3600)).toBe('Sunday 8 November');
		// Near midnight the day is the place's, not Greenwich's.
		expect(dateAt('fr', Date.UTC(2026, 10, 8, 23, 30) / 1000, 3600)).toBe('lundi 9 novembre');
	});
});

describe('freshness and credits', () => {
	const p = page(block('aaaa0001', 'weather'), block('aaaa0002', 'tide'));

	it('says what is old and what did not answer', () => {
		const ok = buildShared(input(p, { aaaa0001: all, aaaa0002: all }));
		expect(ok.stale).toBe(false);
		expect(ok.partial).toBe(false);
		expect(ok.fresh).toBe(NOW);

		const old = buildShared(
			input(p, { aaaa0001: { point: fresh(point, (NOW - 3600) * 1000), tide: null }, aaaa0002: all })
		);
		expect(old.stale).toBe(true);
		expect(old.fresh).toBe(NOW - 3600);

		const missing = buildShared(input(p, { aaaa0001: all, aaaa0002: { point: fresh(point), tide: null } }));
		expect(missing.partial).toBe(true);
		const none = buildShared(
			input(p, { aaaa0001: { point: null, tide: null }, aaaa0002: { point: null, tide: null } })
		);
		expect(none.partial).toBe(true);
		expect(none.fresh).toBeNull();
	});

	it('credits what is shown, once, without web addresses', () => {
		const s = buildShared(input(p, { aaaa0001: all, aaaa0002: all }));
		expect(s.credit).toContain('Open-Meteo.com');
		expect(s.credit).not.toMatch(/https?:/);
		expect(s.credit.match(/Open-Meteo\.com/g)).toHaveLength(1);
		// The sea is not on these two cards: its credit is not on the screen.
		expect(s.credit).not.toContain('Copernicus Marine');
		const sea = buildShared(input(page(block('aaaa0001', 'sea')), { aaaa0001: all }));
		expect(sea.credit).toContain('Copernicus Marine');
	});
});

describe('the words', () => {
	it('has every new word in both languages', () => {
		const fr = Object.keys(TV_TEXT.fr).sort();
		const en = Object.keys(TV_TEXT.en).sort();
		expect(en).toEqual(fr);
		for (const key of [
			'card.official',
			'card.hazards',
			'card.weather',
			'card.surf',
			'card.sea',
			'card.tide',
			'card.sky',
			'card.air',
			'waves',
			'emptyTitle',
			'pair.title'
		]) {
			expect(fr).toContain(key);
		}
	});
});

describe('units and extra cards (official, hazards, surf, sky)', () => {
	it('passes the account units through to the screen', () => {
		const p: SharedPage = {
			...page(block('aaaa0001', 'weather')),
			units: { temperature: 'f', wind: 'mph', height: 'ft' }
		};
		const s = buildShared(input(p, { aaaa0001: all }));
		expect(s.units).toEqual({ temperature: 'f', wind: 'mph', height: 'ft' });
	});

	it('builds official, hazards, surf and sky panels from site-wide context and aurora answers', () => {
		const borders = JSON.parse(
			readFileSync(join(import.meta.dirname, '..', 'data', 'borders.json'), 'utf-8')
		) as Borders;
		const frWarnings = warningsFromApi('FR', fixture('warnings-FR.json')).data;
		const hazards = hazardsFromApi(fixture('hazards.json'));
		const surf = surfOverviewFromApi(fixture('surf-overview.json'))!;
		const aurora = auroraFromApi(fixture('sky-aurora.json'));

		const p = page(
			block('aaaa0001', 'official'),
			block('aaaa0002', 'hazards'),
			block('aaaa0003', 'surf'),
			block('aaaa0004', 'sky')
		);
		const r: Reading = { point: fresh(point), tide: null, aurora: fresh(aurora) };
		const s = buildShared(
			input(
				p,
				{ aaaa0001: r, aaaa0002: r, aaaa0003: r, aaaa0004: r },
				{
					context: {
						served: ['FR'],
						warnings: new Map([['FR', fresh(frWarnings)]]),
						borders,
						hazards: fresh(hazards),
						surf: fresh(surf)
					}
				}
			)
		);
		expect(s.panels.map((x) => x.card)).toEqual(['official', 'hazards', 'surf', 'sky']);
		const surfPanel = s.panels[2];
		expect(surfPanel.card).toBe('surf');
		if (surfPanel.card === 'surf') {
			expect(surfPanel.surf.available).toBe(true);
			expect(surfPanel.surf.spots.length).toBeGreaterThan(0);
		}
		const skyPanel = s.panels[3];
		expect(skyPanel.card).toBe('sky');
		if (skyPanel.card === 'sky') {
			expect(skyPanel.aurora.estimate).toBe(aurora.place != null);
			expect(skyPanel.aurora.activity).not.toBeNull();
		}
		expect(s.credit).toContain('NOAA Space Weather Prediction Center');
	});
});
