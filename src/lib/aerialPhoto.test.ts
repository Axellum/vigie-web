import { describe, expect, it } from 'vitest';
import { PHOTO_MIN_ZOOM, buildingsOverPhoto, photoPieces, waterOverPhoto } from './aerialPhoto';
import { IGN_TERRITORIES, PHOTO_PREFIX } from './ign';

const on = { credit: 'Photo © IGN' };

describe('photoPieces', () => {
	it("asks the IGN's photo of each territory only, from zoom 6", () => {
		const pieces = photoPieces(on, 'light');
		expect(pieces).toHaveLength(IGN_TERRITORIES.length);
		for (const piece of pieces) {
			expect(piece.id.startsWith(PHOTO_PREFIX)).toBe(true);
			expect(piece.layer.source).toBe(piece.id);
			const territory = IGN_TERRITORIES.find((t) => piece.id === `${PHOTO_PREFIX}${t.id}`);
			expect(piece.source.bounds).toEqual(territory?.box);
			expect(piece.source.tiles).toEqual([
				'https://data.geopf.fr/tms/1.0.0/ORTHOIMAGERY.ORTHOPHOTOS/{z}/{x}/{y}.jpeg'
			]);
			expect(piece.source.attribution).toBe('Photo © IGN');
			expect(piece.layer.minzoom).toBe(PHOTO_MIN_ZOOM);
		}
	});

	it('dims the photo in the dark theme only', () => {
		expect(photoPieces(on, 'light')[0].layer.paint['raster-brightness-max']).toBeUndefined();
		expect(photoPieces(on, 'dark')[0].layer.paint['raster-brightness-max']).toBe(0.85);
	});
});

describe('buildingsOverPhoto', () => {
	it("names the base map's buildings that are shown, to be hidden over the photo", () => {
		const layers = [
			{ id: 'water', type: 'fill', 'source-layer': 'water' },
			{ id: 'building', type: 'fill', 'source-layer': 'building' },
			{ id: 'building-top', type: 'fill', 'source-layer': 'building', layout: { visibility: 'visible' } },
			{
				id: 'building-3d',
				type: 'fill-extrusion',
				'source-layer': 'building',
				layout: { visibility: 'none' }
			},
			{ id: 'road', type: 'line', 'source-layer': 'transportation' }
		];
		expect(buildingsOverPhoto(layers)).toEqual(['building', 'building-top']);
	});
});

describe('waterOverPhoto', () => {
	it("draws the base map's water again, opaque and visible, under ids of its own", () => {
		const layers = [
			{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
			{
				id: 'water',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'water',
				filter: ['!=', ['get', 'brunnel'], 'tunnel'],
				layout: { visibility: 'none' },
				paint: { 'fill-color': '#c9d9e3', 'fill-opacity': 0.7 }
			},
			{ id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
			{ id: 'landuse', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse' }
		];
		const over = waterOverPhoto(layers);
		expect(over).toEqual([
			{
				id: 'photo-water-water',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'water',
				filter: ['!=', ['get', 'brunnel'], 'tunnel'],
				minzoom: PHOTO_MIN_ZOOM,
				layout: { visibility: 'visible' },
				paint: { 'fill-color': '#c9d9e3', 'fill-opacity': 1 }
			}
		]);
		// Not twice: the copies are not copied again.
		expect(waterOverPhoto([...layers, ...over])).toHaveLength(1);
	});
});
