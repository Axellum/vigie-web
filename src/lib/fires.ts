// The active fires on the world map (NASA FIRMS, through the API): counted per cell when the map is far, one dot
// per detection when it is close. Each level is cut into fixed tiles, so that the site asks the API once per
// tile and per few minutes, whatever the number of visitors and the way they move the map.
import type { Box } from './geo';

export interface FireLevel {
	id: 'w5' | 'w1' | 'g025' | 'dots';
	/** Cell of the grid, in degrees; null for the detections themselves. */
	cellDeg: number | null;
	/** Side of a tile, in degrees (360: the whole world in one). A multiple of the cell, so no cell is cut. */
	tileDeg: number;
	/** The level serves the zooms below this one. */
	untilZoom: number;
}

// Measured on 20 October 2026 (121,756 detections in 24 hours): the world in 1,889 cells of 2°, 4,147 of 1°;
// at most 974 detections in a cell of 1°, 2,502 in one of 2°. A tile of detections stays under the API's
// limit (5,000), and the strongest come first if one day it does not.
export const FIRE_LEVELS: readonly FireLevel[] = [
	{ id: 'w5', cellDeg: 5, tileDeg: 360, untilZoom: 3 },
	{ id: 'w1', cellDeg: 1, tileDeg: 360, untilZoom: 5.5 },
	{ id: 'g025', cellDeg: 0.25, tileDeg: 30, untilZoom: 7.5 },
	{ id: 'dots', cellDeg: null, tileDeg: 2, untilZoom: Infinity }
];

/** More tiles than this in one view are not asked for (it cannot happen at the zooms of each level). */
export const MAX_FIRE_TILES = 40;

export function fireLevel(zoom: number): FireLevel {
	return FIRE_LEVELS.find((l) => zoom < l.untilZoom) ?? FIRE_LEVELS[FIRE_LEVELS.length - 1];
}

export function fireLevelById(id: string): FireLevel | null {
	return FIRE_LEVELS.find((l) => l.id === id) ?? null;
}

const columns = (level: FireLevel) => Math.ceil(360 / level.tileDeg);
const rows = (level: FireLevel) => Math.ceil(180 / level.tileDeg);

export function isTile(level: FireLevel, x: number, y: number): boolean {
	return (
		Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < columns(level) && y < rows(level)
	);
}

/** West, south, east, north of a tile; tiles count from the south-west corner of the world. */
export function tileBox(level: FireLevel, x: number, y: number): Box {
	const west = -180 + x * level.tileDeg;
	const south = -90 + y * level.tileDeg;
	return [west, south, Math.min(180, west + level.tileDeg), Math.min(90, south + level.tileDeg)];
}

/**
 * The tiles a view needs, as [x, y]. A view may extend past ±180° (the map repeats the world): its longitudes
 * are wrapped. Null when it would take more than MAX_FIRE_TILES.
 */
export function tilesInView(level: FireLevel, view: Box): [number, number][] | null {
	const [west, south, east, north] = view;
	const t = level.tileDeg;
	const cols = columns(level);
	const xs = new Set<number>();
	if (east - west >= 360) for (let x = 0; x < cols; x++) xs.add(x);
	else {
		const first = Math.floor((west + 180) / t);
		const last = Math.floor((east + 180 - 1e-9) / t);
		for (let x = first; x <= last; x++) xs.add(((x % cols) + cols) % cols);
	}
	const clampY = (v: number) => Math.min(rows(level) - 1, Math.max(0, v));
	const firstY = clampY(Math.floor((Math.max(-90, south) + 90) / t));
	const lastY = clampY(Math.floor((Math.min(90, north) + 90 - 1e-9) / t));
	const tiles: [number, number][] = [];
	for (const x of [...xs].sort((a, b) => a - b))
		for (let y = firstY; y <= lastY; y++) {
			tiles.push([x, y]);
			if (tiles.length > MAX_FIRE_TILES) return null;
		}
	return tiles;
}
