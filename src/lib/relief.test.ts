import { describe, expect, it } from 'vitest';
import { IGN_TERRITORIES, RELIEF_PREFIX } from './ign';
import { CONTOURS_FROM_ZOOM, LIDAR_FROM_ZOOM, RELIEF_MIN_ZOOM, reliefPieces } from './relief';

const on = { contours: false, credit: 'Relief © IGN' };

describe('reliefPieces', () => {
	it('draws the shading and the LiDAR HD over each territory, the contour lines only when wanted', () => {
		const pieces = reliefPieces(on, 'light');
		expect(pieces).toHaveLength(2 * IGN_TERRITORIES.length);
		expect(pieces.some((p) => p.id.includes('contour'))).toBe(false);
		const withContours = reliefPieces({ ...on, contours: true }, 'light');
		expect(withContours).toHaveLength(3 * IGN_TERRITORIES.length);
		// From the bottom: the shading, the LiDAR HD, the contour lines.
		const kinds = withContours.map((p) => p.id.split('-')[1]);
		expect(kinds.indexOf('lidar')).toBeGreaterThan(kinds.lastIndexOf('shade'));
		expect(kinds.indexOf('contour')).toBeGreaterThan(kinds.lastIndexOf('lidar'));
	});

	it('keeps each source to its territory, under the prefix the map removes them by', () => {
		for (const piece of reliefPieces({ ...on, contours: true }, 'dark')) {
			expect(piece.id.startsWith(RELIEF_PREFIX)).toBe(true);
			expect(piece.layer.source).toBe(piece.id);
			const territory = IGN_TERRITORIES.find((t) => piece.id.endsWith(`-${t.id}`));
			expect(piece.source.bounds).toEqual(territory?.box);
			expect(piece.source.attribution).toBe('Relief © IGN');
			expect(piece.source.tiles[0]).toMatch(
				/^https:\/\/data\.geopf\.fr\/tms\/1\.0\.0\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.png$/
			);
			expect(piece.layer.paint['raster-fade-duration']).toBe(0);
		}
		const ids = reliefPieces({ ...on, contours: true }, 'light').map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('starts each kind at its zoom and never asks the IGN past its levels', () => {
		const byKind = (kind: string) =>
			reliefPieces({ ...on, contours: true }, 'light').find((p) => p.id.includes(`-${kind}-`));
		expect(byKind('shade')?.layer.minzoom).toBe(RELIEF_MIN_ZOOM);
		expect(byKind('shade')?.source.maxzoom).toBe(15);
		expect(byKind('lidar')?.layer.minzoom).toBe(LIDAR_FROM_ZOOM);
		expect(byKind('contour')?.layer.minzoom).toBe(CONTOURS_FROM_ZOOM);
		expect(CONTOURS_FROM_ZOOM).toBe(13);
		expect(byKind('contour')?.source.maxzoom).toBe(18);
	});

	it('turns the shadows light in the dark theme only', () => {
		const shade = (theme: 'light' | 'dark') => reliefPieces(on, theme)[0].layer.paint;
		expect(shade('light')['raster-brightness-min']).toBeUndefined();
		expect(shade('dark')['raster-brightness-min']).toBe(1);
		expect(shade('dark')['raster-brightness-max']).toBe(0);
	});
});
