// The tide, computed by the API from a global ocean tide model (vigie-api `GET /v1/tides`, `GET /v1/tides/coast`, its ADR 0013):
// the curve of a coastal point, and the tide now along the coasts for the map. Every figure is the API's; a value it did not give
// is left out, never guessed. Not for navigation, and the API says what the model cannot do (harbours, bays): the site shows it.
import type { Feature, FeatureCollection } from 'geojson';
import type { Box } from './geo';

export interface TideExtreme {
	/** UTC epoch seconds. */
	t: number;
	kind: 'high' | 'low';
	/** Height relative to the model's mean sea level (m). */
	h: number;
	/** The range of the tide that ends here (m); null for the first one the API gave. */
	range: number | null;
}

export interface TideNow {
	t: number;
	h: number;
	trend: 'rising' | 'falling';
	nextHigh: TideExtreme | null;
	nextLow: TideExtreme | null;
}

export interface TideCurve {
	model: string | null;
	cell: { lat: number; lon: number; distanceKm: number | null } | null;
	start: number;
	end: number;
	/** [UTC epoch seconds, height in m], in time order. */
	heights: [number, number][];
	extremes: TideExtreme[];
	now: TideNow | null;
	/** The French coefficient estimated by the API at Brest (its own, unofficial), per high water at Brest. */
	coefficients: { t: number; value: number }[];
	limits: string | null;
	disclaimer: string | null;
	attribution: string | null;
}

/** The tide now along the coasts of a tile: points with `h` (height), `up` (1 rising, 0 falling), `hi`/`hh` (time and height of
 *  the next high water) and `lo`/`lh` (the next low water). A value the API did not give is absent. */
export interface TideTile {
	features: FeatureCollection;
	attribution: string | null;
	disclaimer: string | null;
	limits: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function extremeFromApi(raw: unknown): TideExtreme | null {
	const e = obj(raw);
	const t = num(e.time_utc);
	const h = num(e.height_m);
	if (t == null || h == null || (e.kind !== 'high' && e.kind !== 'low')) return null;
	return { t, kind: e.kind, h, range: num(e.range_m) };
}

/** `GET /v1/tides` as the site uses it. Throws when the answer has no curve at all. */
export function tidesFromApi(body: unknown): TideCurve {
	const p = obj(body);
	const heights: [number, number][] = [];
	for (const raw of Array.isArray(p.heights) ? p.heights : []) {
		const t = num(obj(raw).time_utc);
		const h = num(obj(raw).height_m);
		if (t != null && h != null) heights.push([t, h]);
	}
	if (heights.length < 2) throw new Error('The API gave no tide curve');
	heights.sort((a, b) => a[0] - b[0]);
	const extremes = (Array.isArray(p.extremes) ? p.extremes : [])
		.map(extremeFromApi)
		.filter((e): e is TideExtreme => e !== null)
		.sort((a, b) => a.t - b.t);
	const cell = obj(p.cell);
	const cellLat = num(cell.lat);
	const cellLon = num(cell.lon);
	const now = obj(p.now);
	const nowT = num(now.time_utc);
	const nowH = num(now.height_m);
	const coefficients: { t: number; value: number }[] = [];
	for (const raw of Array.isArray(p.coefficients_estimated) ? p.coefficients_estimated : []) {
		const t = num(obj(raw).brest_high_water_utc);
		const value = num(obj(raw).value);
		if (t != null && value != null) coefficients.push({ t, value });
	}
	return {
		model: str(p.model),
		cell:
			cellLat != null && cellLon != null
				? { lat: cellLat, lon: cellLon, distanceKm: num(cell.distance_km) }
				: null,
		start: heights[0][0],
		end: heights[heights.length - 1][0],
		heights,
		extremes,
		now:
			nowT != null && nowH != null && (now.trend === 'rising' || now.trend === 'falling')
				? {
						t: nowT,
						h: nowH,
						trend: now.trend,
						nextHigh: extremeFromApi(now.next_high),
						nextLow: extremeFromApi(now.next_low)
					}
				: null,
		coefficients,
		limits: str(p.limits),
		disclaimer: str(p.disclaimer),
		attribution: str(p.attribution)
	};
}

/** `GET /v1/tides/coast` as compact points for the map. */
export function tideTileFromApi(body: unknown): TideTile {
	const p = obj(body);
	const meta = obj(p.metadata);
	const features: Feature[] = [];
	for (const raw of Array.isArray(p.features) ? p.features : []) {
		const f = obj(raw);
		const coords = obj(f.geometry).coordinates;
		if (!Array.isArray(coords) || num(coords[0]) == null || num(coords[1]) == null) continue;
		const props = obj(f.properties);
		const h = num(props.height_m);
		if (h == null || (props.trend !== 'rising' && props.trend !== 'falling')) continue;
		const out: Record<string, number> = { h, up: props.trend === 'rising' ? 1 : 0 };
		const high = extremeFromApi(props.next_high);
		const low = extremeFromApi(props.next_low);
		if (high) Object.assign(out, { hi: high.t, hh: high.h });
		if (low) Object.assign(out, { lo: low.t, lh: low.h });
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [coords[0], coords[1]] },
			properties: out
		});
	}
	return {
		features: { type: 'FeatureCollection', features },
		attribution: str(meta.attribution),
		disclaimer: str(meta.disclaimer),
		limits: str(meta.limits)
	};
}

// --------------------------------------------------------------------------------------------- the tiles of the map layer

export interface TideLevel {
	id: 'w' | 'c';
	/** Side of a tile, in degrees. */
	tileDeg: number;
	/** The most points the API returns for a tile (it thins the coast to stay under). */
	limit: number;
	/** The level serves the zooms below this one. */
	untilZoom: number;
	/** Below this zoom the layer asks to come closer instead of loading tiles. */
	fromZoom: number;
}

// A tile of 30 degrees thinned to 300 points keeps about one point per half degree of coast; one of 5 degrees, every cell of the
// model (1/8 degree) next to the coast. The API computes them in a few tens of milliseconds and keeps each for five minutes.
export const TIDE_LEVELS: readonly TideLevel[] = [
	{ id: 'w', tileDeg: 30, limit: 300, untilZoom: 6.5, fromZoom: 3 },
	{ id: 'c', tileDeg: 5, limit: 400, untilZoom: Infinity, fromZoom: 6.5 }
];
export const MAX_TIDE_TILES = 24;

export function tideLevel(zoom: number): TideLevel {
	return TIDE_LEVELS.find((l) => zoom < l.untilZoom) ?? TIDE_LEVELS[TIDE_LEVELS.length - 1];
}

export function tideLevelById(id: string): TideLevel | null {
	return TIDE_LEVELS.find((l) => l.id === id) ?? null;
}

const columns = (level: TideLevel) => Math.ceil(360 / level.tileDeg);
const rows = (level: TideLevel) => Math.ceil(180 / level.tileDeg);

export function isTideTile(level: TideLevel, x: number, y: number): boolean {
	return (
		Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < columns(level) && y < rows(level)
	);
}

/** West, south, east, north of a tile; tiles count from the south-west corner of the world. */
export function tideTileBox(level: TideLevel, x: number, y: number): Box {
	const west = -180 + x * level.tileDeg;
	const south = -90 + y * level.tileDeg;
	return [west, south, Math.min(180, west + level.tileDeg), Math.min(90, south + level.tileDeg)];
}

/** The tiles a view needs, as [x, y], its longitudes wrapped; null when it would take more than MAX_TIDE_TILES. Only the
 *  latitudes the model covers (66 S to 66 N) are asked. */
export function tideTilesInView(level: TideLevel, view: Box): [number, number][] | null {
	const [west, south, east, north] = view;
	if (south > 66 || north < -66) return [];
	const t = level.tileDeg;
	const cols = columns(level);
	const y0 = Math.max(0, Math.floor((Math.max(south, -66) + 90) / t));
	const y1 = Math.min(rows(level) - 1, Math.floor((Math.min(north, 66) + 90 - 1e-9) / t));
	const x0 = Math.floor((west + 180) / t);
	const x1 = Math.floor((east + 180 - 1e-9) / t);
	if (y1 < y0) return [];
	const span = Math.min(x1 - x0 + 1, cols);
	if (span * (y1 - y0 + 1) > MAX_TIDE_TILES) return null;
	const tiles: [number, number][] = [];
	for (let i = 0; i < span; i++) {
		const x = (((x0 + i) % cols) + cols) % cols;
		for (let y = y0; y <= y1; y++) tiles.push([x, y]);
	}
	return tiles;
}

// ------------------------------------------------------------------------------------------------------------ the curve

/** Where the French coefficient means something: the Atlantic, Channel and North Sea coasts of mainland France. The API
 *  computes it for any point; the site shows it only here (a box drawn by Vigie, which also takes in a little of Spain and of the
 *  south coast of England, where the curve is shown without the coefficient). */
export function showsFrenchCoefficient(lat: number, lon: number): boolean {
	const inBox = lat >= 43.2 && lat <= 51.2 && lon >= -5.8 && lon <= 2.7;
	const england = lat > 49.95 && lon < 1.45;
	const spain = lat < 43.36 && lon < -1.79;
	return inBox && !england && !spain;
}

export interface CurveGeometry {
	/** The SVG path of the curve, in a box of `width` by `height`. */
	path: string;
	/** The path of the same curve closed down to the bottom, to fill. */
	area: string;
	x: (t: number) => number;
	y: (h: number) => number;
	low: number;
	high: number;
}

/** The curve in an SVG box, with a margin of `pad` at the top and bottom; the extremes it shows count in the scale. */
export function curveGeometry(curve: TideCurve, width: number, height: number, pad = 12): CurveGeometry {
	const hs = curve.heights.map(([, h]) => h);
	const shown = extremesShown(curve).map((e) => e.h);
	const low = Math.min(...hs, ...shown);
	const high = Math.max(...hs, ...shown);
	const span = Math.max(high - low, 0.01);
	const x = (t: number) => ((t - curve.start) / Math.max(curve.end - curve.start, 1)) * width;
	const y = (h: number) => pad + (1 - (h - low) / span) * (height - 2 * pad);
	const points = curve.heights.map(([t, h]) => `${x(t).toFixed(1)},${y(h).toFixed(1)}`);
	const path = `M${points.join('L')}`;
	const area = `${path}L${x(curve.end).toFixed(1)},${height}L${x(curve.start).toFixed(1)},${height}Z`;
	return { path, area, x, y, low, high };
}

/** The extremes of the curve that fall inside its window. */
export function extremesShown(curve: TideCurve): TideExtreme[] {
	return curve.extremes.filter((e) => e.t >= curve.start && e.t <= curve.end);
}

/** The midnights (UTC epoch seconds) inside the window, in the reader's time zone given as an offset function. */
export function midnights(start: number, end: number, offsetMinutes: (t: number) => number): number[] {
	const out: number[] = [];
	const day = 86400;
	let local = Math.ceil((start - offsetMinutes(start) * 60) / day) * day;
	for (let i = 0; i < 10 && local <= end + day; i++, local += day) {
		const t = local + offsetMinutes(local) * 60;
		if (t > start && t < end) out.push(t);
	}
	return out;
}

/** The point of a tide tile inside `box` nearest to `centre` (a zone's centre), or null when the tiles have none there. */
export function nearestCoastPoint(
	features: FeatureCollection['features'],
	box: Box,
	centre: { lat: number; lon: number }
): { lat: number; lon: number } | null {
	const [west, south, east, north] = box;
	const cos = Math.cos((centre.lat * Math.PI) / 180);
	let best: { lat: number; lon: number; d: number } | null = null;
	for (const f of features) {
		if (f.geometry.type !== 'Point') continue;
		const [lon, lat] = f.geometry.coordinates;
		if (lat < south || lat > north || lon < west || lon > east) continue;
		const d = (lat - centre.lat) ** 2 + ((lon - centre.lon) * cos) ** 2;
		if (!best || d < best.d) best = { lat, lon, d };
	}
	return best ? { lat: best.lat, lon: best.lon } : null;
}
