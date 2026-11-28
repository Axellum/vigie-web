// The relief of the map: the hill shading of the IGN (France's national mapping agency, its Géoplateforme), drawn over the
// land colours of the base map and under its rivers, roads, borders and names. The IGN draws it for France only (mainland,
// Corsica and the overseas departments, a few kilometres past the borders): each territory is a source of its own with its
// box, so that the map never asks for a tile outside them. Over the sea inside a box the IGN answers 404, which MapLibre
// takes as an empty tile.
//   - shading: the IGN's shading (`ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW`, black shadows on transparency), at every zoom;
//   - LiDAR HD: the finer shading of the LiDAR HD survey, from zoom 12 (grey, lights and shadows; it has holes where the
//     IGN has not produced it yet, where the shading stays, fainter);
//   - contour lines (`ELEVATION.CONTOUR.LINE`), from zoom 12, when the visitor ticks them.
// The site's map stops at zoom 12 (MapView.svelte): the LiDAR HD and the contour lines are what it shows at its closest.
// The tiles come straight from the IGN to the visitor's browser (CORS open, kept 21 days by the browser): the site's
// server is not on the way. Licence Ouverte 2.0 (Etalab): any use, with the source.
import type { Box } from './geo';

export const RELIEF_HOST = 'https://data.geopf.fr';
const TMS = `${RELIEF_HOST}/tms/1.0.0`;

/** What the page gives the map: null when the relief is off. */
export interface ReliefOnMap {
	contours: boolean;
	/** The credit shown by the map's attribution while the relief is drawn. */
	credit: string;
}

/** Where the IGN draws its relief: one box per territory, [west, south, east, north]. */
export const RELIEF_TERRITORIES: { id: string; box: Box }[] = [
	{ id: 'fr', box: [-5.3, 41.3, 9.7, 51.15] }, // mainland France and Corsica
	{ id: 'antilles', box: [-61.9, 14.35, -60.75, 16.55] }, // Guadeloupe and Martinique
	{ id: 'guyane', box: [-54.65, 2.1, -51.6, 5.8] },
	{ id: 'reunion', box: [55.2, -21.42, 55.86, -20.85] },
	{ id: 'mayotte', box: [44.95, -13.05, 45.35, -12.6] },
	{ id: 'spm', box: [-56.45, 46.7, -56.1, 47.15] } // Saint-Pierre-et-Miquelon
];

/** Below this zoom the shading cannot be seen at the scale of the map: nothing is asked. */
export const RELIEF_MIN_ZOOM = 6;
/** The LiDAR HD shading takes over from this zoom (before, its tiles have holes). */
export const LIDAR_FROM_ZOOM = 12;
/** The contour lines are drawn from this zoom (at zoom 11 they are so close together in the mountains that they hide the map). */
export const CONTOURS_FROM_ZOOM = 12;

type Theme = 'light' | 'dark';
type Paint = Record<string, unknown>;

interface Kind {
	id: 'shade' | 'lidar' | 'contour';
	layer: string;
	maxzoom: number;
	minzoom: number;
	paint: (theme: Theme) => Paint;
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

/** The ids of the map's relief layers and sources all start with this. */
export const RELIEF_PREFIX = 'relief-';

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
export function reliefPieces(relief: ReliefOnMap, theme: Theme): ReliefPiece[] {
	const pieces: ReliefPiece[] = [];
	for (const kind of KINDS) {
		if (kind.id === 'contour' && !relief.contours) continue;
		for (const territory of RELIEF_TERRITORIES) {
			const id = `${RELIEF_PREFIX}${kind.id}-${territory.id}`;
			pieces.push({
				id,
				source: {
					type: 'raster',
					tiles: [`${TMS}/${kind.layer}/{z}/{x}/{y}.png`],
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

/**
 * The layer of the base map the relief goes under: its first line (rivers, then roads and borders) or, failing that, its first
 * label. The relief then lies over the land, the water and the woods, and under everything else.
 */
export function reliefBefore(layers: { id: string; type: string }[]): string | undefined {
	return layers.find((l) => l.type === 'line' || l.type === 'symbol')?.id;
}

/** The stored choice; anything unreadable gives the default: the relief on, the contour lines off. */
export function parseReliefChoice(raw: string | null): { on: boolean; contours: boolean } {
	try {
		const v = JSON.parse(raw ?? '') as { on?: unknown; contours?: unknown };
		return { on: v?.on !== false, contours: v?.contours === true };
	} catch {
		return { on: true, contours: false };
	}
}
