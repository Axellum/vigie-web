// Small geometry helpers for the map: boxes, longitudes that wrap around, covered countries in view.
import countryBoxes from './data/countries.json';

/** [west, south, east, north] in degrees. */
export type Box = [number, number, number, number];

/** The countries that have a source of official warnings, with the boxes of their main land parts. */
export const COVERED = countryBoxes as unknown as Record<string, Box[]>;
export const COVERED_CODES = Object.keys(COVERED).sort();

export function isCovered(cc: string): boolean {
	return cc.toUpperCase() in COVERED;
}

/** Brings a longitude into the 360° window that starts at `west`. */
function wrapInto(lon: number, west: number): number {
	return ((((lon - west) % 360) + 360) % 360) + west;
}

/** Whether two boxes overlap; the view may span more than 360° or cross the antimeridian. */
export function boxesOverlap(view: Box, box: Box): boolean {
	const [vw, vs, ve, vn] = view;
	const [bw, bs, be, bn] = box;
	if (bn < vs || bs > vn) return false;
	if (ve - vw >= 360) return true;
	const w = wrapInto(bw, vw);
	const width = be >= bw ? be - bw : be + 360 - bw;
	return w <= ve || w + width - 360 >= vw;
}

export function pointInBox(view: Box, lon: number, lat: number): boolean {
	const [vw, vs, ve, vn] = view;
	if (lat < vs || lat > vn) return false;
	if (ve - vw >= 360) return true;
	return wrapInto(lon, vw) <= ve;
}

/** Covered countries with at least one main part inside the view. */
export function coveredInView(view: Box): string[] {
	return COVERED_CODES.filter((cc) => COVERED[cc].some((box) => boxesOverlap(view, box)));
}

/** The box that holds every main part of a country (for zooming on it), or null when not covered. */
export function countryBox(cc: string): Box | null {
	const boxes = COVERED[cc.toUpperCase()];
	if (!boxes || boxes.length === 0) return null;
	// The largest part comes first. Parts close to it are added (Corsica for France); far ones are not
	// (Alaska, overseas territories), so that the frame stays readable.
	const [w0, s0, e0, n0] = boxes[0];
	const cx = (w0 + e0) / 2,
		cy = (s0 + n0) / 2;
	let box: Box = [w0, s0, e0, n0];
	for (const [w, s, e, n] of boxes.slice(1)) {
		if (Math.abs((w + e) / 2 - cx) > 15 || Math.abs((s + n) / 2 - cy) > 15) continue;
		box = [Math.min(box[0], w), Math.min(box[1], s), Math.max(box[2], e), Math.max(box[3], n)];
	}
	return box;
}

/** Bounding box of any GeoJSON geometry. */
export function geometryBox(geometry: {
	type: string;
	coordinates?: unknown;
	geometries?: unknown[];
}): Box | null {
	let w = Infinity,
		s = Infinity,
		e = -Infinity,
		n = -Infinity;
	const visit = (c: unknown): void => {
		if (!Array.isArray(c)) return;
		if (typeof c[0] === 'number') {
			const [x, y] = c as number[];
			w = Math.min(w, x);
			e = Math.max(e, x);
			s = Math.min(s, y);
			n = Math.max(n, y);
		} else c.forEach(visit);
	};
	if (geometry.type === 'GeometryCollection') {
		for (const g of (geometry.geometries ?? []) as { coordinates?: unknown }[]) visit(g.coordinates);
	} else visit(geometry.coordinates);
	return Number.isFinite(w) ? [w, s, e, n] : null;
}
