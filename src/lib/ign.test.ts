import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DETAILS_PREFIX,
	IGN_DEFAULT,
	IGN_HOST,
	PHOTO_PREFIX,
	RELIEF_PREFIX,
	ignBefore,
	overBaseMap,
	parseIgnChoice
} from './ign';

// A base map as OpenFreeMap's: its land, water and woods, then its lines, then its names.
const base = [
	{ id: 'background', type: 'background' },
	{ id: 'water', type: 'fill' },
	{ id: 'landcover_wood', type: 'fill' },
	{ id: 'waterway', type: 'line' },
	{ id: 'road', type: 'line' },
	{ id: 'place_city', type: 'symbol' }
];
type Layer = { id: string; type: string };

/** Adds a layer as MapLibre does: before the named layer, or on top. */
function add(layers: Layer[], layer: Layer, before?: string) {
	const at = before === undefined ? layers.length : layers.findIndex((l) => l.id === before);
	layers.splice(at, 0, layer);
}

describe('ignBefore', () => {
	it('puts the IGN layers under the first line or label of the base map', () => {
		for (const prefix of [PHOTO_PREFIX, RELIEF_PREFIX, DETAILS_PREFIX]) {
			expect(ignBefore(base, prefix)).toBe('waterway');
			expect(ignBefore([base[0], base[5]], prefix)).toBe('place_city');
			expect(ignBefore([base[0]], prefix)).toBeUndefined();
		}
	});

	it('keeps the photo under the relief and the relief under the details, whichever comes first', () => {
		const orders = [
			[DETAILS_PREFIX, RELIEF_PREFIX, PHOTO_PREFIX],
			[RELIEF_PREFIX, PHOTO_PREFIX, DETAILS_PREFIX],
			[PHOTO_PREFIX, DETAILS_PREFIX, RELIEF_PREFIX]
		];
		for (const order of orders) {
			const layers: Layer[] = base.map((l) => ({ ...l }));
			for (const prefix of order) {
				const before = ignBefore(layers, prefix);
				add(layers, { id: `${prefix}a`, type: prefix === DETAILS_PREFIX ? 'line' : 'raster' }, before);
				add(layers, { id: `${prefix}b`, type: prefix === PHOTO_PREFIX ? 'fill' : 'raster' }, before);
			}
			expect(layers.map((l) => l.id)).toEqual([
				'background',
				'water',
				'landcover_wood',
				'photo-a',
				'photo-b',
				'relief-a',
				'relief-b',
				'details-a',
				'details-b',
				'waterway',
				'road',
				'place_city'
			]);
		}
	});
});

describe('overBaseMap', () => {
	it("puts the details' names right over the base map, under the site's own layers", () => {
		const layers = [
			...base,
			{ id: 'details-fr-beach', type: 'circle' },
			{ id: 'zone-selected', type: 'line' }
		];
		expect(overBaseMap(layers, 'place_city')).toBe('zone-selected');
		expect(overBaseMap(base, 'place_city')).toBeUndefined();
		expect(overBaseMap(layers, undefined)).toBeUndefined();
		expect(overBaseMap(layers, 'gone')).toBeUndefined();
	});
});

describe('parseIgnChoice', () => {
	it('shows the relief and the details, hides the contour lines and the photo unless the visitor chose otherwise', () => {
		expect(IGN_DEFAULT).toEqual({ on: true, contours: false, photo: false, details: true });
		expect(parseIgnChoice(null)).toEqual(IGN_DEFAULT);
		expect(parseIgnChoice('not json')).toEqual(IGN_DEFAULT);
		expect(parseIgnChoice('null')).toEqual(IGN_DEFAULT);
		expect(parseIgnChoice('{"on":"no","contours":"yes","photo":1,"details":0}')).toEqual(IGN_DEFAULT);
		expect(parseIgnChoice('{"on":false,"contours":true,"photo":true,"details":false}')).toEqual({
			on: false,
			contours: true,
			photo: true,
			details: false
		});
	});

	it('reads a choice stored when the relief was alone, the new layers at their defaults', () => {
		expect(parseIgnChoice('{"on":false,"contours":true}')).toEqual({
			on: false,
			contours: true,
			photo: false,
			details: true
		});
	});
});

// The Content-Security-Policy of vite.config.ts must let the browser load the IGN's tiles, or the map stays flat with an
// error in the console.
it("lets the IGN's tiles through the Content-Security-Policy", () => {
	const config = readFileSync(join(import.meta.dirname, '..', '..', 'vite.config.ts'), 'utf-8');
	expect(config).toContain(`const IGN_HOST = '${IGN_HOST}'`);
	expect(config).toMatch(/'img-src': \[[^\]]*IGN_HOST/);
	expect(config).toMatch(/'connect-src': \[[^\]]*IGN_HOST/);
});
