import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	edgeWeight,
	fieldLevelFromApi,
	finestFirst,
	flowAlpha,
	flowClass,
	flowCount,
	gridFromPixels,
	levelsWanted,
	sampleGrid,
	sampleWind,
	windFieldFromApi,
	type FieldGrid,
	type FieldLevel
} from './windField';
import { nearestHour, parseWindFieldChoice } from './windFieldLayer.svelte';

// A real answer of the API and its three images (e2e/fixtures/index.json says which): ARPEGE and AROME, 2026-11-22 00 UTC.
const fixtures = join(import.meta.dirname, '..', '..', 'e2e', 'fixtures');
const answer = JSON.parse(readFileSync(join(fixtures, 'wind-field.json'), 'utf-8'));

/** The pixels of one of the API's PNG (8-bit RGB, filters None and Sub only, as it writes them), as RGBA. */
function pixels(file: string): Uint8Array {
	const data = readFileSync(join(fixtures, file));
	let i = 8;
	let width = 0;
	let height = 0;
	const idat: Buffer[] = [];
	while (i < data.length) {
		const length = data.readUInt32BE(i);
		const kind = data.toString('latin1', i + 4, i + 8);
		const body = data.subarray(i + 8, i + 8 + length);
		if (kind === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			expect([body[8], body[9]]).toEqual([8, 2]);
		}
		if (kind === 'IDAT') idat.push(body);
		i += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(idat));
	const out = new Uint8Array(width * height * 4);
	const row = 1 + width * 3;
	for (let y = 0; y < height; y++) {
		const filter = raw[y * row];
		expect(filter === 0 || filter === 1).toBe(true);
		const line = Uint8Array.from(raw.subarray(y * row + 1, (y + 1) * row));
		if (filter === 1) for (let x = 3; x < line.length; x++) line[x] = (line[x] + line[x - 3]) & 255;
		for (let x = 0; x < width; x++) {
			out.set(line.subarray(x * 3, x * 3 + 3), (y * width + x) * 4);
			out[(y * width + x) * 4 + 3] = 255;
		}
	}
	return out;
}

const field = windFieldFromApi(answer)!;
const level = (id: string) => field.levels.find((l) => l.id === id)!;
const real: FieldGrid[] = finestFirst(
	(['world', 'europe', 'france'] as const).map((id) =>
		gridFromPixels(level(id), pixels(`wind-field-${id}.png`))
	)
);
const at = (grids: FieldGrid[], lon: number, lat: number) => {
	const out = [0, 0];
	return sampleWind(grids, lon, lat, out) ? out : null;
};

/** A small grid of the given components (rows from the north), as the API would describe it. */
function synthetic(over: Partial<FieldLevel>, u: number[][], v: number[][], scale = 20): FieldGrid {
	const height = u.length;
	const width = u[0].length;
	const step = over.step ?? 1;
	const west = over.bbox?.[0] ?? 0;
	const north = over.bbox?.[3] ?? height - 1;
	const lvl: FieldLevel = {
		id: 'europe',
		model: 'ARPEGE',
		run: 0,
		valid: 0,
		bbox: [west, north - (height - 1) * step, west + (width - 1) * step, north],
		width,
		height,
		step,
		wholeWorld: false,
		scale,
		minZoom: 3,
		image: '/data/wind-field/europe/2026112200-2026112118.png',
		...over
	};
	const rgba = new Uint8Array(width * height * 4);
	const byte = (ms: number) => Math.round((ms / scale) * 127.5 + 127.5);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const p = (y * width + x) * 4;
			const none = Number.isNaN(u[y][x]);
			rgba.set([none ? 0 : byte(u[y][x]), none ? 0 : byte(v[y][x]), none ? 0 : 255, 255], p);
		}
	return gridFromPixels(lvl, rgba);
}

describe('the answer of the API', () => {
	it('reads the grids of the hour and addresses their images on this site', () => {
		expect(field.status).toBe('ok');
		expect(field.valid).toBe(1_795_305_600);
		expect(field.levels.map((l) => [l.id, l.model, l.minZoom])).toEqual([
			['world', 'ARPEGE', 0],
			['europe', 'ARPEGE', 3],
			['france', 'AROME', 5]
		]);
		expect(level('world')).toMatchObject({ width: 720, height: 361, step: 0.5, wholeWorld: true, scale: 26 });
		expect(level('france').bbox).toEqual([-12, 37.5, 16, 55.4]);
		expect(level('france').image).toBe('/data/wind-field/france/2026112200-2026112118.png');
		expect(field.attribution).toContain('Météo-France');
	});

	it('says off without a key, unavailable when nothing was read, and refuses what is not an answer', () => {
		expect(windFieldFromApi({ status: 'not_configured', levels: [] })?.status).toBe('off');
		expect(windFieldFromApi({ status: 'unavailable', valid_utc: 1, levels: [] })?.status).toBe('unavailable');
		expect(windFieldFromApi({ status: 'ok', levels: [] })?.status).toBe('unavailable');
		expect(windFieldFromApi({ detail: 'Not Found' })).toBeNull();
		expect(windFieldFromApi('<html>')).toBeNull();
	});

	it('leaves out a grid whose image address is not one of the API', () => {
		const raw = answer.levels[2];
		expect(fieldLevelFromApi({ ...raw, image: '/v1/wind/field/france/../../admin.png' })).toBeNull();
		expect(fieldLevelFromApi({ ...raw, image: 'https://elsewhere.example/a.png' })).toBeNull();
		expect(fieldLevelFromApi({ ...raw, id: 'mars' })).toBeNull();
		expect(fieldLevelFromApi({ ...raw, width: 0 })).toBeNull();
	});
});

describe('the grids worth loading', () => {
	const france: [number, number, number, number] = [-5, 42, 8, 51];
	const pacific: [number, number, number, number] = [-170, -30, -120, 10];
	const ids = (view: typeof france | null, zoom: number) => levelsWanted(field, view, zoom).map((l) => l.id);
	it('are the world always, Europe from zoom 3 and France from zoom 5 over their boxes', () => {
		expect(ids(france, 1)).toEqual(['world']);
		expect(ids(france, 3)).toEqual(['world', 'europe']);
		expect(ids(france, 5.2)).toEqual(['world', 'europe', 'france']);
		expect(ids(pacific, 6)).toEqual(['world']);
		expect(ids(null, 6)).toEqual(['world']);
		expect(levelsWanted(null, france, 6)).toEqual([]);
	});
});

describe('reading the wind of a point', () => {
	it('interpolates between the four nodes around it', () => {
		const g = synthetic(
			{},
			[
				[0, 10],
				[10, 20]
			],
			[
				[5, 5],
				[-5, -5]
			]
		);
		const out = [0, 0];
		expect(sampleGrid(g, 0.5, 0.5, out)).toBe(true);
		expect(out[0]).toBeCloseTo(10, 0);
		expect(out[1]).toBeCloseTo(0, 0);
		expect(sampleGrid(g, 1, 1, out)).toBe(true); // the north-east node
		expect(out[0]).toBeCloseTo(10, 0);
		expect(sampleGrid(g, 1.01, 0.5, out)).toBe(false); // outside
	});

	it('gives the values of the image within half a step of the scale', () => {
		const g = synthetic({}, [[13.7, -2.2]], [[0.4, 19.9]], 20).u;
		expect(Math.abs(g[0] - 13.7)).toBeLessThan(20 / 255 + 1e-6);
	});

	it('takes the coarser grid where a node of the finer has no value, and fades the finer one in over its edge', () => {
		const coarse = synthetic(
			{ id: 'world', wholeWorld: false, bbox: [-10, -10, 10, 10], step: 20 },
			[
				[0, 0],
				[0, 0]
			],
			[
				[0, 0],
				[0, 0]
			]
		);
		const fine = synthetic(
			{ id: 'france', bbox: [0, 0, 8, 8], step: 1 },
			Array.from({ length: 9 }, (_, y) =>
				Array.from({ length: 9 }, (_, x) => (x === 0 && y === 0 ? NaN : 8))
			),
			Array.from({ length: 9 }, () => Array(9).fill(0))
		);
		const grids = finestFirst([coarse, fine]);
		expect(grids.map((g) => g.id)).toEqual(['france', 'world']);
		expect(fine.ramp).toBe(8);
		expect(edgeWeight(fine, 4, 4)).toBeCloseTo(0.5);
		expect(at(grids, 4, 4)![0]).toBeCloseTo(4, 0); // half the fine (8), half the coarse (0)
		expect(at(grids, 0.2, 7.8)![0]).toBeCloseTo(0, 0); // by the corner without a value: the coarse
		expect(at(grids, 20, 0)).toBeNull(); // no grid there
	});

	it('goes round the world on the whole-world grid', () => {
		const world = real.find((g) => g.id === 'world')!;
		const east = [0, 0];
		const west = [0, 0];
		expect(sampleGrid(world, 179.9, 10, east)).toBe(true);
		expect(sampleGrid(world, -180.1, 10, west)).toBe(true); // the same place, written the other way
		expect(west[0]).toBeCloseTo(east[0], 4);
		expect(sampleGrid(world, 539.9, 10, west)).toBe(true);
		expect(west[0]).toBeCloseTo(east[0], 4);
	});

	it('reads the real grids of the hour: AROME wins over France, ARPEGE beyond, one wind everywhere', () => {
		const france = real.find((g) => g.id === 'france')!;
		const brest = [0, 0];
		expect(sampleGrid(france, -4.49, 48.39, brest)).toBe(true);
		const both = at(real, -4.49, 48.39)!; // deep inside AROME: AROME alone
		expect(both[0]).toBeCloseTo(brest[0], 5);
		expect(both[1]).toBeCloseTo(brest[1], 5);
		for (const [lon, lat] of [
			[-4.49, 48.39],
			[2.35, 48.86],
			[-30, 60],
			[140, -40],
			[0, 89.9],
			[0, -89.9]
		]) {
			const w = at(real, lon, lat);
			expect(w, `${lon},${lat}`).not.toBeNull();
			expect(Math.hypot(w![0], w![1])).toBeLessThan(45);
		}
	});
});

describe('how the trails look', () => {
	it('stays quiet below 40 km/h, then takes the colours of the strong wind', () => {
		expect(flowClass(39.9 / 3.6)).toBe(0);
		expect(flowClass(40 / 3.6)).toBe(1);
		expect(flowClass(60 / 3.6)).toBe(2);
		expect(flowAlpha(0)).toBeCloseTo(0.2);
		expect(flowAlpha(30)).toBeCloseTo(0.66);
		expect(flowAlpha(5)).toBeLessThan(flowAlpha(10));
	});

	it('keeps an even density on every screen', () => {
		expect(flowCount(375, 600)).toBe(346);
		expect(flowCount(1280, 720)).toBe(1418);
		expect(flowCount(100, 100)).toBe(150);
		expect(flowCount(4000, 3000)).toBe(3000);
	});
});

describe('the choice and the hour', () => {
	it('reads the stored choice, off when unreadable', () => {
		expect(parseWindFieldChoice('{"on":true}')).toBe(true);
		expect(parseWindFieldChoice('{"on":"yes"}')).toBe(false);
		expect(parseWindFieldChoice('nope')).toBe(false);
		expect(parseWindFieldChoice(null)).toBe(false);
	});

	it('takes the whole hour nearest to now, as the API', () => {
		expect(nearestHour(Date.UTC(2026, 10, 22, 0, 29, 59))).toBe(1_795_305_600);
		expect(nearestHour(Date.UTC(2026, 10, 22, 0, 30))).toBe(1_795_309_200);
	});
});
