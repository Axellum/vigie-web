import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { surfOverviewFromApi, type SurfSpotNow } from '../surf';
import { bandOf, keepLabels, LABEL_GAP, labelSize, pinFeatures, pinText, seaPins } from './map';
import { rankSpots, seaOverviewFromApi } from './overview';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));

const overview = seaOverviewFromApi(fixture('activities-overview.json'))!;
const surf = surfOverviewFromApi(fixture('surf-overview.json'))!;
const hour = (now: Partial<NonNullable<SurfSpotNow['now']>>): SurfSpotNow['now'] => ({
	t: 0,
	daylight: true,
	swell: { height: null, period: null, from: null },
	wind: { speed: null, gust: null, from: null, relative: null },
	tide: null,
	rating: null,
	...now
});

describe('the figures of a pin', () => {
	it('gives the swell for the surf, the wind for the kite and the boat, the tide for shore fishing', () => {
		const now = hour({
			swell: { height: 1.24, period: 9.4, from: 290 },
			wind: { speed: 33.3, gust: 40, from: 270, relative: 'onshore' },
			tide: { height: -1.3, trend: 'rising', stage: 'low' }
		});
		expect(pinText('fr', 'surf', now, 'kmh')).toBe('1,2 m · 9 s');
		expect(pinText('en', 'surf', now, 'kmh')).toBe('1.2 m · 9 s');
		expect(pinText('fr', 'kite', now, 'kmh')).toBe('33 km/h');
		// 33.3 km/h is 18 knots: the conversion is the exact one of `units.ts`.
		expect(pinText('fr', 'boat', now, 'kn')).toBe('18 nœuds');
		expect(pinText('fr', 'shore_fishing', now, 'kmh')).toBe('tiers bas');
		expect(
			pinText('fr', 'shore_fishing', hour({ tide: { height: -1.3, trend: 'rising', stage: null } }), 'kmh')
		).toBe('-1,3 m');
	});

	it('leaves out what the API did not give, and never makes it up', () => {
		expect(pinText('fr', 'surf', null, 'kmh')).toBeNull();
		expect(pinText('fr', 'surf', hour({}), 'kmh')).toBeNull();
		expect(pinText('fr', 'surf', hour({ swell: { height: 0.8, period: null, from: null } }), 'kmh')).toBe(
			'0,8 m'
		);
		expect(pinText('fr', 'kite', hour({}), 'kmh')).toBeNull();
		expect(pinText('fr', 'shore_fishing', hour({}), 'kmh')).toBeNull();
	});
});

describe('the pins of the sea map', () => {
	it('has one pin per spot that can be judged, in the order of the list, with the verdict and the figures of the API', () => {
		const rows = rankSpots(overview.spots, 'surf', null);
		const pins = seaPins('fr', rows, surf.spots, 'surf', 'kmh');
		expect(pins.map((p) => p.id)).toEqual(rows.map((r) => r.spot.id));
		for (const [i, pin] of pins.entries()) {
			expect(pin.verdict).toBe(rows[i].activity.verdict);
			expect(pin.rank).toBe(
				pin.verdict === 'good' ? 0 : pin.verdict === 'possible' ? 1 : pin.verdict === 'poor' ? 2 : 3
			);
			const now = surf.spots.find((s) => s.id === pin.id)?.now ?? null;
			expect(pin.text).toBe(pinText('fr', 'surf', now, 'kmh'));
			expect(pin.tide).toBe(now?.tide?.trend ?? null);
			// The surf pins say no wind direction: their figures are the swell's.
			expect(pin.windFrom).toBeNull();
			expect(pin.label.startsWith(`${pin.name} : `)).toBe(true);
		}
		// The recording has the tide of every spot: each pin says which way it goes, in words for a screen reader.
		expect(pins.every((p) => p.tide)).toBe(true);
		expect(
			pins.some((p) => p.label.includes('marée montante') || p.label.includes('marée descendante'))
		).toBe(true);
	});

	it('draws the wind direction on the pins of the kite, and keeps the verdict when the surf overview is missing', () => {
		const rows = rankSpots(overview.spots, 'kite', null);
		const pins = seaPins('en', rows, surf.spots, 'kite', 'kn');
		const withWind = pins.filter((p) => p.windFrom != null);
		expect(withWind.length).toBeGreaterThan(0);
		expect(withWind[0].label).toContain('wind from ');
		expect(withWind[0].text).toMatch(/^\d+ kn$/);

		const bare = seaPins('fr', rows, null, 'kite', 'kmh');
		expect(bare.map((p) => p.verdict)).toEqual(rows.map((r) => r.activity.verdict));
		expect(bare.every((p) => p.text == null && p.tide == null && p.windFrom == null)).toBe(true);
	});

	it('colours the dot under each pin with the band of its verdict', () => {
		expect([bandOf('good'), bandOf('possible'), bandOf('poor'), bandOf(null)]).toEqual([3, 2, 0, -1]);
		const pins = seaPins('fr', rankSpots(overview.spots, 'boat', null), surf.spots, 'boat', 'kmh');
		const dots = pinFeatures(pins);
		expect(dots.features).toHaveLength(pins.length);
		expect(dots.features[0].properties).toEqual({
			id: pins[0].id,
			name: pins[0].name,
			q: bandOf(pins[0].verdict)
		});
		expect(dots.features[0].geometry).toEqual({ type: 'Point', coordinates: [pins[0].lon, pins[0].lat] });
	});
});

describe('the labels kept on the map', () => {
	const pin = (id: string, rank: number) => ({
		id,
		rank,
		text: '1,2 m · 9 s',
		name: id,
		windFrom: null,
		tide: null
	});

	it('keeps the best verdict where two labels would touch, and the chosen spot whatever its verdict', () => {
		const pins = [pin('poor', 2), pin('good', 0), pin('far', 1)];
		const at = (p: { id: string }): [number, number] =>
			p.id === 'far' ? [600, 300] : [300, p.id === 'good' ? 300 : 310];
		expect(keepLabels(pins, at, null).map((k) => k.pin.id)).toEqual(['good', 'far']);
		expect(keepLabels(pins, at, 'poor').map((k) => k.pin.id)).toEqual(['poor', 'far']);
	});

	it('keeps labels one above the other when they do not touch, and leaves out a spot off screen', () => {
		const pins = [pin('a', 1), pin('b', 1), pin('c', 0)];
		const at = (p: { id: string }): [number, number] | null =>
			p.id === 'c' ? null : [300, p.id === 'a' ? 300 : 300 + labelSize(pins[0])[1] + LABEL_GAP + 1];
		expect(keepLabels(pins, at, null).map((k) => k.pin.id)).toEqual(['a', 'b']);
	});

	it('puts a label on the right of its dot where the left would leave the screen', () => {
		const kept = keepLabels(
			[pin('edge', 0), pin('middle', 0)],
			(p) => (p.id === 'edge' ? [20, 100] : [400, 100]),
			null
		);
		expect(kept.map((k) => [k.pin.id, k.side])).toEqual([
			['edge', 'right'],
			['middle', 'left']
		]);
	});

	it('makes room for the arrows of the wind and of the tide', () => {
		const [w] = labelSize({ text: '18 nœuds', name: 'x', windFrom: null, tide: null });
		expect(labelSize({ text: '18 nœuds', name: 'x', windFrom: 270, tide: 'rising' })[0]).toBe(w + 30);
	});
});
