import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	availableLeadHours,
	cutPixels,
	fadingEdges,
	featherCore,
	featherInto,
	featherWeights,
	imageCoordinates,
	pickRainOverlay,
	pickRainStack,
	rainFieldFromApi,
	rainPieces,
	rainLevelFrom,
	type RainField
} from './rainField';
import { parseRainFieldChoice } from './rainFieldLayer.svelte';

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'rain-field.json'), 'utf-8'));

describe('rainField', () => {
	it('parses the recorded rain-field payload and rewrites frame URLs to the site proxy', () => {
		const rf = rainFieldFromApi(fixture);
		expect(rf?.status).toBe('ok');
		expect(rf?.levels.map((l) => l.id)).toEqual(['world', 'europe', 'france']);
		expect(availableLeadHours(rf)).toEqual([1, 2, 3, 6, 12, 24]);
		expect(rf?.levels[0].frames[0].url).toMatch(/^\/data\/rain-field\/world\/\d{10}-\d{10}\.png$/);
		expect(rf?.legend).toHaveLength(9);
		expect(rf?.attribution).toContain('Météo-France');
		expect(rf?.note).toContain('not a radar');
	});

	it('handles not_configured, unavailable and malformed answers honestly', () => {
		expect(rainFieldFromApi({ status: 'not_configured' })?.status).toBe('off');
		expect(rainFieldFromApi({ status: 'unavailable', levels: [] })?.status).toBe('unavailable');
		expect(rainFieldFromApi(null)).toBeNull();
		expect(rainLevelFrom('france')).toBe('france');
		expect(rainLevelFrom('mars')).toBeNull();
	});

	it('picks the finest level matching zoom and view, and clamps Mercator image corners', () => {
		const rf = rainFieldFromApi(fixture);
		const world = pickRainOverlay(rf, [-170, -58, 190, 75], 1.4, 3, 'credit');
		expect(world?.level.id).toBe('world');
		expect(world?.frame.leadHours).toBe(3);

		const europe = pickRainOverlay(rf, [-10, 38, 20, 56], 4, 6, 'credit');
		expect(europe?.level.id).toBe('europe');
		expect(europe?.frame.leadHours).toBe(6);

		const france = pickRainOverlay(rf, [-5.5, 41.2, 9.8, 51.3], 6, 1, 'credit');
		expect(france?.level.id).toBe('france');
		expect(france?.level.model).toBe('AROME');

		// Outside Europe/France even at high zoom falls back to world.
		const pacific = pickRainOverlay(rf, [130, 30, 145, 40], 6, 12, 'credit');
		expect(pacific?.level.id).toBe('world');

		const corners = imageCoordinates([-180, -90, 180, 90]);
		expect(corners[0][1]).toBeCloseTo(85.051129, 4);
		expect(corners[2][1]).toBeCloseTo(-85.051129, 4);
	});

	it('stacks the levels a view needs, the coarsest first, down to the first one that holds the whole view', () => {
		const rf = rainFieldFromApi(fixture);
		const ids = (view: [number, number, number, number], zoom: number, lead = 1) =>
			pickRainStack(rf, view, zoom, lead, 'credit').map((l) => l.level);
		// The world at a small zoom; the Europe grid does not reach it yet.
		expect(ids([-170, -58, 190, 75], 1.4)).toEqual(['world']);
		// Europe and the North Atlantic at zoom 3: the Europe grid, and the world around it (no straight edge any more).
		expect(ids([-40, 25, 60, 70], 3.05)).toEqual(['world', 'europe']);
		// A view inside the Europe grid needs nothing under it.
		expect(ids([-10, 38, 20, 56], 4)).toEqual(['europe']);
		// France and its east: AROME where it is, ARPEGE Europe around it.
		expect(ids([0, 42, 20, 52], 5.6)).toEqual(['europe', 'france']);
		expect(ids([-5.5, 41.2, 9.8, 51.3], 6)).toEqual(['france']);
		// Far from both grids, the world only.
		expect(ids([130, 30, 145, 40], 6, 12)).toEqual(['world']);
		const stack = pickRainStack(rf, [-40, 25, 60, 70], 3.05, 6, 'credit');
		expect(stack[1]).toMatchObject({ level: 'europe', bounds: [-32, 20, 42, 72], attribution: 'credit' });
		expect(stack[1].url).toMatch(/^\/data\/rain-field\/europe\/\d{10}-\d{10}\.png$/);
		expect(stack[1].id).toContain('rain-field-europe-');
		expect(pickRainStack(null, [-40, 25, 60, 70], 3, 1, '')).toEqual([]);
	});

	it('leaves out a level that does not offer the lead time', () => {
		const rf = rainFieldFromApi(fixture) as RainField;
		const noEurope6 = {
			...rf,
			levels: rf.levels.map((l) =>
				l.id === 'europe' ? { ...l, frames: l.frames.filter((f) => f.leadHours !== 6) } : l
			)
		};
		expect(pickRainStack(noEurope6, [-10, 38, 20, 56], 4, 6, '').map((l) => l.level)).toEqual(['world']);
	});

	it('fades a finer level into the coarser one on the edges beyond which the coarser one goes on', () => {
		const world: [number, number, number, number] = [-180, -85, 180, 85];
		const europe: [number, number, number, number] = [-32, 20, 42, 72];
		expect(fadingEdges(europe, world)).toEqual([true, true, true, true]);
		expect(fadingEdges([-180, 20, 42, 85], world)).toEqual([false, true, true, false]);
		// 100 pixels: a band of 2, smooth, the same on both sides; no fading edge, the finer image whole.
		const w = featherWeights(100, true, true);
		expect(w[0]).toBeCloseTo(0.15625, 6);
		expect(w[1]).toBeCloseTo(0.84375, 6);
		expect([...w.slice(2, 98)].every((v) => v === 1)).toBe(true);
		expect(w[99]).toBeCloseTo(w[0], 6);
		expect([...featherWeights(100, false, true).slice(0, 98)].every((v) => v === 1)).toBe(true);
		// A view inside the band's inner edge does not see the fade.
		const core = featherCore(europe);
		expect(core[0]).toBeCloseTo(-32 + 74 * 0.02, 6);
		expect(core[2]).toBeCloseTo(42 - 74 * 0.02, 6);
		expect(core[1]).toBeGreaterThan(20);
		expect(core[3]).toBeLessThan(72);
	});

	it('mixes the two images on the band only, by their alpha', () => {
		const W = 100;
		const H = 50;
		const fill = (r: number, g: number, b: number, a: number) => {
			const out = new Uint8ClampedArray(W * H * 4);
			for (let i = 0; i < out.length; i += 4) out.set([r, g, b, a], i);
			return out;
		};
		const at = (img: Uint8ClampedArray, x: number, y: number) => [
			...img.slice((y * W + x) * 4, (y * W + x) * 4 + 4)
		];
		const all: [boolean, boolean, boolean, boolean] = [true, true, true, true];
		// The finer model dry, the coarser one raining: its rain on the edge, fading inward, its colour kept.
		const dry = fill(0, 0, 0, 0);
		featherInto(dry, fill(200, 40, 0, 255), W, H, all);
		expect(at(dry, 0, 25)).toEqual([200, 40, 0, Math.round(255 * (1 - 0.15625))]);
		expect(at(dry, 1, 25)[3]).toBe(Math.round(255 * (1 - 0.84375)));
		expect(at(dry, 50, 25)).toEqual([0, 0, 0, 0]);
		// The other way round: the finer model's rain fades out toward the edge, still blue.
		const rain = fill(0, 60, 220, 255);
		featherInto(rain, fill(0, 0, 0, 0), W, H, all);
		expect(at(rain, 99, 25)).toEqual([0, 60, 220, Math.round(255 * 0.15625)]);
		expect(at(rain, 50, 25)).toEqual([0, 60, 220, 255]);
		// The same rain in both: no lighter line on the band.
		const same = fill(10, 120, 240, 255);
		featherInto(same, fill(10, 120, 240, 255), W, H, all);
		expect(at(same, 0, 0)).toEqual([10, 120, 240, 255]);
		// No fading edge: untouched.
		const kept = fill(0, 60, 220, 255);
		featherInto(kept, fill(0, 0, 0, 0), W, H, [false, false, false, false]);
		expect(at(kept, 0, 0)).toEqual([0, 60, 220, 255]);
	});

	it('draws a coarser level in pieces that stop exactly on the edges of the finer ones', () => {
		const world: [number, number, number, number] = [-180, -85, 180, 85];
		const europe: [number, number, number, number] = [-32, 20, 42, 72];
		const france: [number, number, number, number] = [-12, 37.5, 16, 55.4];
		// Around Europe (France, inside it, cuts nothing more): north, south, west and east of it.
		const around = rainPieces(world, [europe, france]);
		expect(around).toHaveLength(4);
		expect(around).toEqual(
			expect.arrayContaining([
				[-180, -85, 180, 20],
				[-180, 72, 180, 85],
				[-180, 20, -32, 72],
				[42, 20, 180, 72]
			])
		);
		// The pieces and the cut cover the level once: the same area, and no two overlap.
		const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);
		expect(around.reduce((a, b) => a + area(b), 0) + area(europe)).toBeCloseTo(area(world), 6);
		for (const [i, a] of around.entries())
			for (const b of around.slice(i + 1))
				expect(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]).toBe(false);
		// Nothing to cut: the level whole; a cut that reaches an edge leaves fewer pieces.
		expect(rainPieces(europe, [])).toEqual([europe]);
		expect(rainPieces(europe, [[0, 10, 60, 80]])).toEqual([[-32, 20, 0, 72]]);
		expect(rainPieces(europe, [europe])).toEqual([]);
	});

	it('finds a cut on the image: columns even in longitude, rows even in Web Mercator', () => {
		expect(cutPixels([-180, -85, 180, 85], [-180, -85, 180, 85], 720, 360)).toEqual([0, 0, 720, 360]);
		const [x, y, w, h] = cutPixels([-180, -85, 180, 85], [0, -85, 90, 0], 720, 360);
		expect([x, w]).toEqual([360, 180]);
		expect(y).toBeCloseTo(180, 6);
		expect(h).toBeCloseTo(180, 6);
		// Half of the height of the Europe grid in Mercator is well north of the middle latitude.
		const [, top, , half] = cutPixels([-32, 20, 42, 72], [-32, 20, 42, 52.53], 371, 260);
		expect(top).toBeGreaterThan(125);
		expect(top + half).toBeCloseTo(260, 6);
	});

	it('defaults the stored preference to off', () => {
		expect(parseRainFieldChoice(null)).toBe(false);
		expect(parseRainFieldChoice('invalid')).toBe(false);
		expect(parseRainFieldChoice('{"on":false}')).toBe(false);
		expect(parseRainFieldChoice('{"on":true}')).toBe(true);
	});
});
