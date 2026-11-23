// Global, Europe and France forecast rain overlays (vigie-api `GET /v1/rain/field`, ADR 0041): 1-hour precipitation
// accumulations from Météo-France's ARPEGE (world, Europe) and AROME (France), rendered by the API as Web Mercator
// RGBA PNG overlays ready for a MapLibre `image` source. Transparent below 0.1 mm/h and outside the grid.
// A forecast, never a radar measure and never a warning.
import { boxesOverlap, pointInBox, type Box } from './geo';
import type { RadarClass } from './radar';

export type RainLevelId = 'world' | 'europe' | 'france';
const LEVEL_IDS: readonly RainLevelId[] = ['world', 'europe', 'france'];
/** Finest resolution first when picking the overlay for a view. */
const FINEST_FIRST: Record<RainLevelId, number> = { france: 0, europe: 1, world: 2 };

export interface RainFieldFrame {
	stamp: string;
	validUtc: number;
	leadHours: number;
	/** Site proxy URL (`/data/rain-field/<level>/<stamp>.png`). */
	url: string;
}

export interface RainFieldLevel {
	id: RainLevelId;
	model: string;
	bounds: Box;
	minZoom: number;
	runUtc: number | null;
	frames: RainFieldFrame[];
}

export interface RainField {
	status: 'ok' | 'off' | 'unavailable';
	baseUtc: number | null;
	stale: boolean;
	levels: RainFieldLevel[];
	legend: RadarClass[];
	attribution: string | null;
	note: string | null;
}

/** What MapView draws for the forecast rain overlay: one level of it. */
export interface RainFieldOnMap {
	id: string;
	level: RainLevelId;
	url: string;
	/** Four [lon, lat] corners for MapLibre `image` source: [NW, NE, SE, SW]. */
	coordinates: [[number, number], [number, number], [number, number], [number, number]];
	/** The box of the image, its latitudes clamped as `coordinates`. */
	bounds: Box;
	attribution: string;
}

const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Stamp format `<valid>-<run>` (e.g. `2026112214-2026112206`), validated before proxying. */
export const RAIN_FIELD_STAMP = /^\d{10}-\d{10}$/;

/** Validates a level id from a URL param. */
export const rainLevelFrom = (value: string): RainLevelId | null =>
	(LEVEL_IDS as readonly string[]).includes(value) ? (value as RainLevelId) : null;

/** Site-relative proxy path for one forecast rain PNG overlay. */
export function rainFieldImagePath(level: RainLevelId, stamp: string): string {
	return `/data/rain-field/${level}/${stamp}.png`;
}

/** Parses one level of `GET /v1/rain/field`; null when unusable. */
export function rainFieldLevelFromApi(raw: unknown): RainFieldLevel | null {
	const l = obj(raw);
	const id = rainLevelFrom(str(l.id) ?? '');
	if (!id) return null;
	const b = Array.isArray(l.bounds) ? l.bounds.map(num) : [];
	if (b.length !== 4 || b.some((v) => v === null)) return null;
	const frames: RainFieldFrame[] = [];
	for (const f of Array.isArray(l.frames) ? l.frames : []) {
		const item = obj(f);
		const stamp = str(item.stamp) ?? /\/([^/]+)\.png$/.exec(str(item.url) ?? '')?.[1] ?? '';
		const validUtc = num(item.valid_utc);
		const leadHours = num(item.lead_hours);
		if (!RAIN_FIELD_STAMP.test(stamp) || validUtc === null || leadHours === null || leadHours < 0) continue;
		frames.push({
			stamp,
			validUtc,
			leadHours: Math.round(leadHours),
			url: rainFieldImagePath(id, stamp)
		});
	}
	frames.sort((a, b) => a.leadHours - b.leadHours);
	if (frames.length === 0) return null;
	return {
		id,
		model: str(l.model) ?? '',
		bounds: b as Box,
		minZoom: num(l.min_zoom) ?? 0,
		runUtc: num(l.run_utc),
		frames
	};
}

/** Parses `GET /v1/rain/field`, rewriting frame URLs to this site's proxy; null for a malformed answer. */
export function rainFieldFromApi(body: unknown): RainField | null {
	const raw = obj(body);
	if (raw.status === 'not_configured') {
		return {
			status: 'off',
			baseUtc: null,
			stale: false,
			levels: [],
			legend: [],
			attribution: null,
			note: null
		};
	}
	if (raw.status !== 'ok' && raw.status !== 'unavailable') return null;
	const levels = (Array.isArray(raw.levels) ? raw.levels : [])
		.map(rainFieldLevelFromApi)
		.filter((l): l is RainFieldLevel => l !== null);
	const legend: RadarClass[] = [];
	for (const c of Array.isArray(raw.legend) ? raw.legend : []) {
		const item = obj(c);
		const minMmH = num(item.min_mm_h);
		const alpha = num(item.alpha);
		if (minMmH === null || typeof item.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(item.color)) continue;
		legend.push({ minMmH, color: item.color, alpha: alpha ?? 1 });
	}
	return {
		status: raw.status === 'ok' && levels.length > 0 ? 'ok' : 'unavailable',
		baseUtc: num(raw.base_utc),
		stale: raw.stale === true,
		levels,
		legend,
		attribution: str(raw.attribution),
		note: str(raw.note)
	};
}

/** Distinct forecast lead hours available across levels, sorted ascending (e.g. [1, 2, 3, 6, 12, 24]). */
export function availableLeadHours(field: RainField | null): number[] {
	if (!field || field.status !== 'ok') return [];
	const set = new Set<number>();
	for (const l of field.levels) {
		for (const f of l.frames) set.add(f.leadHours);
	}
	return [...set].sort((a, b) => a - b);
}

const MERCATOR_LAT = 85.051129;
const clampLat = (lat: number) => Math.max(-MERCATOR_LAT, Math.min(MERCATOR_LAT, lat));
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (clampLat(lat) * Math.PI) / 360));
const latitudeOf = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

/** A box with its latitudes clamped to Web Mercator limits, as the image is drawn. */
export function mercatorBounds(bounds: Box): Box {
	return [bounds[0], clampLat(bounds[1]), bounds[2], clampLat(bounds[3])];
}

/** Clamps latitudes to Web Mercator limits and returns MapLibre `image` source corners `[NW, NE, SE, SW]`. */
export function imageCoordinates(
	bounds: Box
): [[number, number], [number, number], [number, number], [number, number]] {
	const [west, south, east, north] = mercatorBounds(bounds);
	return [
		[west, north],
		[east, north],
		[east, south],
		[west, south]
	];
}

/**
 * Picks the single finest level covering the current map view at `zoom` that offers `leadHours`,
 * falling back to coarser levels (up to `world`) so we never double-blend two different models.
 */
export function pickRainOverlay(
	field: RainField | null,
	view: Box | null,
	zoom: number,
	leadHours: number,
	credit: string
): { overlay: RainFieldOnMap; level: RainFieldLevel; frame: RainFieldFrame } | null {
	if (!field || field.status !== 'ok') return null;
	const sorted = [...field.levels].sort((a, b) => FINEST_FIRST[a.id] - FINEST_FIRST[b.id]);
	const center =
		view !== null
			? {
					lon: (view[0] + view[2]) / 2 > 180 ? (view[0] + view[2]) / 2 - 360 : (view[0] + view[2]) / 2,
					lat: (view[1] + view[3]) / 2
				}
			: null;

	const match = (l: RainFieldLevel) => {
		const frame = l.frames.find((f) => f.leadHours === leadHours);
		if (!frame) return null;
		if (l.id === 'world') return frame;
		if (zoom < l.minZoom || !view || !center) return null;
		if (pointInBox(l.bounds, center.lon, center.lat) || boxesOverlap(view, l.bounds)) return frame;
		return null;
	};

	for (const level of sorted) {
		const frame = match(level);
		if (!frame) continue;
		return {
			level,
			frame,
			overlay: {
				id: `rain-field-${level.id}-${frame.stamp}`,
				level: level.id,
				url: frame.url,
				coordinates: imageCoordinates(level.bounds),
				bounds: mercatorBounds(level.bounds),
				attribution: credit
			}
		};
	}
	return null;
}

const contains = (outer: Box, inner: Box) =>
	inner[0] >= outer[0] && inner[2] <= outer[2] && inner[1] >= outer[1] && inner[3] <= outer[3];

/**
 * The levels the map stacks for `view` at `zoom`, the coarsest first: every level that offers `leadHours`, reaches this zoom and
 * touches the view, from the finest down to the first one that holds the whole view, its fading band included. A view wider
 * than the Europe or the France grid thus shows the coarser grid around it, instead of rain that stops on a straight line. Each
 * place is drawn by one level only (`rainPieces`); on a thin band inside a finer level, its image fades into the coarser one
 * (`featherInto`).
 */
export function pickRainStack(
	field: RainField | null,
	view: Box | null,
	zoom: number,
	leadHours: number,
	credit: string
): RainFieldOnMap[] {
	if (!field || field.status !== 'ok') return [];
	const stack: RainFieldOnMap[] = [];
	for (const level of [...field.levels].sort((a, b) => FINEST_FIRST[a.id] - FINEST_FIRST[b.id])) {
		const frame = level.frames.find((f) => f.leadHours === leadHours);
		if (!frame) continue;
		if (level.id !== 'world' && (zoom < level.minZoom || !view || !boxesOverlap(view, level.bounds)))
			continue;
		const bounds = mercatorBounds(level.bounds);
		stack.unshift({
			id: `rain-field-${level.id}-${frame.stamp}`,
			level: level.id,
			url: frame.url,
			coordinates: imageCoordinates(level.bounds),
			bounds,
			attribution: credit
		});
		if (view && contains(featherCore(bounds), view)) break;
	}
	return stack;
}

/**
 * Two models do not agree everywhere (AROME dry where ARPEGE drizzles): side by side, they would meet on a straight line. On a
 * band inside the finer level's box, this share of its width and of its height, its image fades into the coarser one drawn on
 * the same pixels (`featherInto`): the finer model alone inside the band, the coarser one alone at the edge.
 */
export const FEATHER_SHARE = 0.02;

/** West, south, east, north. */
export type Edges = [boolean, boolean, boolean, boolean];

/** The edges of `box` beyond which `under` goes on: the finer level fades there. */
export function fadingEdges(box: Box, under: Box): Edges {
	return [box[0] > under[0], box[1] > under[1], box[2] < under[2], box[3] < under[3]];
}

/**
 * The weight of the finer image at each of `size` pixels along one axis: 0 on a fading edge (`low`: the first pixel's side,
 * `high`: the last one's), 1 from the band inside, smooth in between.
 */
export function featherWeights(size: number, low: boolean, high: boolean): Float32Array {
	const band = Math.max(1, FEATHER_SHARE * size);
	const out = new Float32Array(size);
	for (let i = 0; i < size; i++) {
		let k = 1;
		if (low) k = Math.min(k, (i + 0.5) / band);
		if (high) k = Math.min(k, (size - i - 0.5) / band);
		out[i] = k * k * (3 - 2 * k);
	}
	return out;
}

/**
 * Fades the finer image `fine` into `coarse` (the coarser level drawn on the same pixels) on its band, in place. Both are RGBA,
 * `width` x `height`, rows from the north, colours not premultiplied (`getImageData`). The colours are mixed weighted by their
 * alpha, so a dry pixel lowers the rain's alpha without greying its colour.
 */
export function featherInto(
	fine: Uint8ClampedArray,
	coarse: Uint8ClampedArray,
	width: number,
	height: number,
	edges: Edges
) {
	const cols = featherWeights(width, edges[0], edges[2]);
	const rows = featherWeights(height, edges[3], edges[1]);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const w = Math.min(rows[y], cols[x]);
			if (w >= 1) continue;
			const i = (y * width + x) * 4;
			const f = fine[i + 3] * w;
			const c = coarse[i + 3] * (1 - w);
			const a = f + c;
			if (a > 0) for (let k = 0; k < 3; k++) fine[i + k] = (fine[i + k] * f + coarse[i + k] * c) / a;
			fine[i + 3] = a;
		}
	}
}

/** The part of a level's box its band leaves alone, on every side: a view inside it does not see the fade. */
export function featherCore(bounds: Box): Box {
	const [w, s, e, n] = bounds;
	const dx = (e - w) * FEATHER_SHARE;
	const top = mercatorY(n);
	const bottom = mercatorY(s);
	const dy = (top - bottom) * FEATHER_SHARE;
	return [w + dx, latitudeOf(bottom + dy), e - dx, latitudeOf(top - dy)];
}

/**
 * The rectangles of `bounds` that none of `cuts` covers, as few as a grid of their edges allows (cells merged along a row, then
 * rows of the same width one under the other). Each is drawn as its own image whose corners lie exactly on the cuts, so the
 * coarser level stops where it should, which a cut on its own pixels does not (a line as wide as one of them, a few pixels of
 * the screen).
 */
export function rainPieces(bounds: Box, cuts: readonly Box[]): Box[] {
	const [w, s, e, n] = bounds;
	const inside = cuts
		.map((c): Box => [Math.max(w, c[0]), Math.max(s, c[1]), Math.min(e, c[2]), Math.min(n, c[3])])
		.filter((c) => c[0] < c[2] && c[1] < c[3]);
	if (!inside.length) return [bounds];
	const edges = (a: number, b: number, more: number[]) => [...new Set([a, b, ...more])].sort((p, q) => p - q);
	const xs = edges(
		w,
		e,
		inside.flatMap((c) => [c[0], c[2]])
	);
	const ys = edges(
		s,
		n,
		inside.flatMap((c) => [c[1], c[3]])
	);
	const rows: Box[] = [];
	for (let j = 0; j < ys.length - 1; j++) {
		let run: Box | null = null;
		for (let i = 0; i < xs.length - 1; i++) {
			const cell: Box = [xs[i], ys[j], xs[i + 1], ys[j + 1]];
			if (inside.some((c) => c[0] <= cell[0] && c[2] >= cell[2] && c[1] <= cell[1] && c[3] >= cell[3])) {
				if (run) rows.push(run);
				run = null;
			} else if (run) run[2] = cell[2];
			else run = cell;
		}
		if (run) rows.push(run);
	}
	const pieces: Box[] = [];
	for (const r of rows.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1])) {
		const last = pieces.at(-1);
		if (last && last[0] === r[0] && last[2] === r[2] && last[3] === r[1]) last[3] = r[3];
		else pieces.push([...r]);
	}
	return pieces;
}

/**
 * Where the box `cut` falls on an image of `width` x `height` pixels that covers `bounds`: `[x, y, width, height]` in pixels, not
 * rounded. The columns of the image are evenly spaced in longitude and its rows in Web Mercator Y (vigie-api, ADR 0041).
 */
export function cutPixels(
	bounds: Box,
	cut: Box,
	width: number,
	height: number
): [number, number, number, number] {
	const [w, s, e, n] = bounds;
	const x = (lon: number) => ((lon - w) / (e - w)) * width;
	const top = mercatorY(n);
	const y = (lat: number) => ((top - mercatorY(lat)) / (top - mercatorY(s))) * height;
	return [x(cut[0]), y(cut[3]), x(cut[2]) - x(cut[0]), y(cut[1]) - y(cut[3])];
}
