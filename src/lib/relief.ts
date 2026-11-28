// The relief of the map: the hill shading of the IGN (France's national mapping agency), drawn over the land colours of
// the base map (and over its aerial photo when ticked) and under its rivers, roads, borders and names. France only, one
// source per territory ($lib/ign). Over the sea inside a box the IGN answers 404, which MapLibre takes as an empty tile.
//   - shading: the IGN's shading (`ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW`, black shadows on transparency), at every zoom;
//   - LiDAR HD: the finer shading of the LiDAR HD survey, from zoom 12 (grey, lights and shadows; it has holes where the
//     IGN has not produced it yet, where the shading stays, fainter);
//   - contour lines (`ELEVATION.CONTOUR.LINE`), from zoom 13, when the visitor ticks them.
import { IGN_TERRITORIES, IGN_TMS, RELIEF_PREFIX, type MapTheme } from './ign';
import type { Box } from './geo';

/** What the page gives the map: null when the relief is off. */
export interface ReliefOnMap {
	contours: boolean;
	/** The credit shown by the map's attribution while the relief is drawn. */
	credit: string;
}

/** Below this zoom the shading cannot be seen at the scale of the map: nothing is asked. */
export const RELIEF_MIN_ZOOM = 6;
/** The LiDAR HD shading takes over from this zoom (before, its tiles have holes). */
export const LIDAR_FROM_ZOOM = 12;
/** The contour lines are drawn from this zoom (closer together in the mountains, they hide the map). */
export const CONTOURS_FROM_ZOOM = 13;

type Paint = Record<string, unknown>;

interface Kind {
	id: 'shade' | 'lidar' | 'contour';
	layer: string;
	maxzoom: number;
	minzoom: number;
	paint: (theme: MapTheme) => Paint;
}

// The opacities were chosen on the rendered site, light and dark (2026-11-28). In the dark theme black shadows do not show on
// an almost black map: the shading is turned light (a `raster-brightness-min` above `raster-brightness-max` inverts the
// colours), and the LiDAR HD's greys are darkened and given more contrast (inverted, its slopes would seem lit from below).
const KINDS: Kind[] = [
	{
		id: 'shade',
		layer: 'ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW',
		maxzoom: 15,
		minzoom: RELIEF_MIN_ZOOM,
		paint: (theme) => ({
			// Fainter once the LiDAR HD draws over it: it only fills the LiDAR's holes.
			'raster-opacity': [
				'interpolate',
				['linear'],
				['zoom'],
				LIDAR_FROM_ZOOM - 0.5,
				theme === 'dark' ? 0.3 : 0.5,
				LIDAR_FROM_ZOOM + 0.5,
				theme === 'dark' ? 0.15 : 0.25
			],
			...(theme === 'dark' ? { 'raster-brightness-min': 1, 'raster-brightness-max': 0 } : {}),
			'raster-fade-duration': 0
		})
	},
	{
		id: 'lidar',
		layer: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW',
		maxzoom: 18,
		minzoom: LIDAR_FROM_ZOOM,
		paint: (theme) => ({
			'raster-opacity': theme === 'dark' ? 0.6 : 0.32,
			...(theme === 'dark' ? { 'raster-brightness-max': 0.5, 'raster-contrast': 0.25 } : {}),
			'raster-fade-duration': 0
		})
	},
	{
		id: 'contour',
		layer: 'ELEVATION.CONTOUR.LINE',
		maxzoom: 18,
		minzoom: CONTOURS_FROM_ZOOM,
		paint: (theme) => ({
			'raster-opacity': theme === 'dark' ? 0.35 : 0.5,
			...(theme === 'dark' ? { 'raster-saturation': -0.3 } : {}),
			'raster-fade-duration': 0
		})
	}
];

export interface ReliefPiece {
	id: string;
	source: {
		type: 'raster';
		tiles: string[];
		tileSize: 256;
		minzoom: number;
		maxzoom: number;
		bounds: Box;
		attribution: string;
	};
	layer: { id: string; type: 'raster'; source: string; minzoom: number; paint: Paint };
}

/** The sources and layers of the relief, from the bottom: the shading, the LiDAR HD, then the contour lines if wanted. */
export function reliefPieces(relief: ReliefOnMap, theme: MapTheme): ReliefPiece[] {
	const pieces: ReliefPiece[] = [];
	for (const kind of KINDS) {
		if (kind.id === 'contour' && !relief.contours) continue;
		for (const territory of IGN_TERRITORIES) {
			const id = `${RELIEF_PREFIX}${kind.id}-${territory.id}`;
			pieces.push({
				id,
				source: {
					type: 'raster',
					tiles: [`${IGN_TMS}/${kind.layer}/{z}/{x}/{y}.png`],
					tileSize: 256,
					minzoom: 0,
					maxzoom: kind.maxzoom,
					bounds: territory.box,
					attribution: relief.credit
				},
				layer: { id, type: 'raster', source: id, minzoom: kind.minzoom, paint: kind.paint(theme) }
			});
		}
	}
	return pieces;
}
