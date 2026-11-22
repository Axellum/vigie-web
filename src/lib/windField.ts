// The forecast wind of the map, drawn as thin moving trails behind the other layers (`windFlow.ts`): the wind at 10 m of
// Météo-France's models for the whole hour nearest to now (vigie-api `GET /v1/wind/field`, its ADR 0038). ARPEGE over the world
// (every 0.5°) and over Europe (0.2°), AROME over France (0.05°), each sent as a PNG whose red and green bytes are the east and
// north components against the strongest component of the grid (`scale`), and whose blue is 255 where the model has a value.
// The finest grid that has a value wins at each point, faded into the coarser one over its edge so that no seam shows.
// A forecast, never a measure (the badges of `$lib/wind`) nor a warning.
import { boxesOverlap, type Box } from './geo';

export type FieldLevelId = 'world' | 'europe' | 'france';
const LEVEL_IDS: readonly FieldLevelId[] = ['world', 'europe', 'france'];
/** The finest first: the order in which a point is looked for. */
const FINEST_FIRST: Record<FieldLevelId, number> = { france: 0, europe: 1, world: 2 };

export interface FieldLevel {
	id: FieldLevelId;
	/** `AROME` or `ARPEGE`. */
	model: string;
	/** Epoch seconds of the run and of the hour of the forecast. */
	run: number;
	valid: number;
	/** West, south, east, north of the nodes (the centres of the image's pixels), in degrees. */
	bbox: Box;
	width: number;
	height: number;
	/** Degrees between two nodes, the same along both axes. */
	step: number;
	/** The grid goes round the world: its last column is next to its first. */
	wholeWorld: boolean;
	/** Metres per second of a byte at 0 or 255. */
	scale: number;
	/** The zoom of the map from which this grid is worth loading (the world's is 0). */
	minZoom: number;
	/** The address of the image on this site (`/data/wind-field/<level>/<stamp>.png`). */
	image: string;
}

export interface WindField {
	/** `ok` with grids; `off` when the API serves no forecast wind (no key, or an older API); `unavailable` when it failed. */
	status: 'ok' | 'off' | 'unavailable';
	/** Epoch seconds of the hour of the forecast; null without one. */
	valid: number | null;
	/** The answer is an older one, kept because the portal failed. */
	stale: boolean;
	levels: FieldLevel[];
	attribution: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The stamp of an image (`<hour>-<run>`, `2026112200-2026112118`): the only part of an address the site takes from the API. */
export const FIELD_STAMP = /^\d{10}-\d{10}$/;

/** The address of an image on this site. */
export function fieldImagePath(level: FieldLevelId, stamp: string): string {
	return `/data/wind-field/${level}/${stamp}.png`;
}

/** One grid of the API's answer; null when it lacks what places or reads it. */
export function fieldLevelFromApi(raw: unknown): FieldLevel | null {
	const l = obj(raw);
	const id = str(l.id) as FieldLevelId | null;
	if (!id || !LEVEL_IDS.includes(id)) return null;
	const bbox = Array.isArray(l.bbox) ? l.bbox.map(num) : [];
	const width = num(l.width);
	const height = num(l.height);
	const step = num(l.step_deg);
	const scale = num(l.scale_ms);
	const run = num(l.run_utc);
	const valid = num(l.valid_utc);
	const stamp = /\/([^/]+)\.png$/.exec(str(l.image) ?? '')?.[1] ?? '';
	if (bbox.length !== 4 || bbox.some((v) => v === null)) return null;
	if (!width || !height || width < 2 || height < 2 || !step || step <= 0 || !scale || scale <= 0) return null;
	if (run === null || valid === null || !FIELD_STAMP.test(stamp)) return null;
	return {
		id,
		model: str(l.model) ?? '',
		run,
		valid,
		bbox: bbox as Box,
		width,
		height,
		step,
		wholeWorld: l.whole_world === true,
		scale,
		minZoom: num(l.min_zoom) ?? 0,
		image: fieldImagePath(id, stamp)
	};
}

/** The answer of `GET /v1/wind/field`, its images addressed on this site; null for an answer that is not one. */
export function windFieldFromApi(body: unknown): WindField | null {
	const raw = obj(body);
	if (raw.status === 'not_configured')
		return { status: 'off', valid: null, stale: false, levels: [], attribution: null };
	if (raw.status !== 'ok' && raw.status !== 'unavailable') return null;
	const levels = (Array.isArray(raw.levels) ? raw.levels : [])
		.map(fieldLevelFromApi)
		.filter((l): l is FieldLevel => l !== null);
	return {
		status: raw.status === 'ok' && levels.length ? 'ok' : 'unavailable',
		valid: num(raw.valid_utc),
		stale: raw.stale === true,
		levels,
		attribution: str(raw.attribution)
	};
}

/** The grids worth loading for a view: the world always, a finer one once the map is close enough and over its box. */
export function levelsWanted(field: WindField | null, view: Box | null, zoom: number): FieldLevel[] {
	if (!field || field.status !== 'ok') return [];
	return field.levels.filter(
		(l) => l.wholeWorld || (zoom >= l.minZoom && view !== null && boxesOverlap(view, l.bbox))
	);
}

// ============================================================================
// The grids, read from the images
// ============================================================================

export interface FieldGrid {
	id: FieldLevelId;
	/** The image it was read from (a new hour has a new one). */
	image: string;
	west: number;
	south: number;
	east: number;
	north: number;
	step: number;
	width: number;
	height: number;
	wholeWorld: boolean;
	/** Degrees over which a grid that does not go round the world fades into the coarser one at its edges. */
	ramp: number;
	/** East and north components in m/s, row by row from the north-west; NaN where the model has no value. */
	u: Float32Array;
	v: Float32Array;
}

/** A grid fades into the coarser one over this many of its own steps from its edge. */
const RAMP_STEPS = 8;

/** The grid of an image from its pixels (RGBA, as a canvas gives them back); an error when the size is not the one announced. */
export function gridFromPixels(level: FieldLevel, rgba: ArrayLike<number>): FieldGrid {
	const n = level.width * level.height;
	if (rgba.length !== n * 4)
		throw new Error(`the image of ${level.id} is not ${level.width} x ${level.height}`);
	const u = new Float32Array(n);
	const v = new Float32Array(n);
	const k = level.scale / 127.5;
	for (let i = 0; i < n; i++) {
		const p = i * 4;
		if (rgba[p + 2] < 128) {
			u[i] = NaN;
			v[i] = NaN;
		} else {
			u[i] = (rgba[p] - 127.5) * k;
			v[i] = (rgba[p + 1] - 127.5) * k;
		}
	}
	const [west, south, east, north] = level.bbox;
	return {
		id: level.id,
		image: level.image,
		west,
		south,
		east,
		north,
		step: level.step,
		width: level.width,
		height: level.height,
		wholeWorld: level.wholeWorld,
		ramp: level.wholeWorld ? 0 : RAMP_STEPS * level.step,
		u,
		v
	};
}

/** The grids in the order a point is looked for: the finest first. */
export function finestFirst(grids: FieldGrid[]): FieldGrid[] {
	return [...grids].sort((a, b) => FINEST_FIRST[a.id] - FINEST_FIRST[b.id]);
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * The wind of one grid at a point, by bilinear interpolation between the four nodes around it, written into `out` ([east,
 * north] m/s). False when the point is outside the grid or a node around it has no value.
 */
export function sampleGrid(g: FieldGrid, lon: number, lat: number, out: Float32Array | number[]): boolean {
	const fy = (g.north - lat) / g.step;
	if (!(fy >= 0) || fy > g.height - 1) return false;
	let fx: number;
	if (g.wholeWorld) {
		fx = (wrapLon(lon) - g.west) / g.step;
		fx = ((fx % g.width) + g.width) % g.width;
	} else {
		fx = (lon - g.west) / g.step;
		if (!(fx >= 0) || fx > g.width - 1) return false;
	}
	const i0 = Math.floor(fx);
	const j0 = Math.min(Math.floor(fy), g.height - 2);
	const i1 = g.wholeWorld ? (i0 + 1) % g.width : Math.min(i0 + 1, g.width - 1);
	const tx = fx - i0;
	const ty = fy - j0;
	const a = j0 * g.width;
	const b = a + g.width;
	const u00 = g.u[a + i0];
	const u10 = g.u[a + i1];
	const u01 = g.u[b + i0];
	const u11 = g.u[b + i1];
	// A node without a value (outside AROME's domain): NaN spreads, and the coarser grid is taken.
	const u = (u00 * (1 - tx) + u10 * tx) * (1 - ty) + (u01 * (1 - tx) + u11 * tx) * ty;
	if (Number.isNaN(u)) return false;
	const v =
		(g.v[a + i0] * (1 - tx) + g.v[a + i1] * tx) * (1 - ty) + (g.v[b + i0] * (1 - tx) + g.v[b + i1] * tx) * ty;
	if (Number.isNaN(v)) return false;
	out[0] = u;
	out[1] = v;
	return true;
}

/** How much a grid counts at a point: 1 inside, down to 0 at its edge over `ramp` degrees. */
export function edgeWeight(g: FieldGrid, lon: number, lat: number): number {
	if (g.wholeWorld || g.ramp <= 0) return 1;
	const d = Math.min(lon - g.west, g.east - lon, lat - g.south, g.north - lat);
	return d <= 0 ? 0 : d >= g.ramp ? 1 : d / g.ramp;
}

const scratch = new Float32Array(2);

/** The wind at a point from the grids (finest first), written into `out` ([east, north] m/s); false where none has a value. */
export function sampleWind(
	grids: FieldGrid[],
	lon: number,
	lat: number,
	out: Float32Array | number[]
): boolean {
	let left = 1;
	let u = 0;
	let v = 0;
	for (let i = 0; i < grids.length; i++) {
		const g = grids[i];
		if (!sampleGrid(g, lon, lat, scratch)) continue;
		// The coarsest grid takes all that is left: there is nothing to fade into under it.
		const take = left * (i === grids.length - 1 ? 1 : edgeWeight(g, lon, lat));
		if (take <= 0) continue;
		u += take * scratch[0];
		v += take * scratch[1];
		left -= take;
		if (left < 1e-3) break;
	}
	if (left >= 1) return false;
	out[0] = u / (1 - left);
	out[1] = v / (1 - left);
	return true;
}

// ============================================================================
// How the trails look
// ============================================================================

/** The trails take a colour from these speeds (km/h), the steps 4 and 5 of the measured wind's badges; below, the quiet ink. */
export const FLOW_STRONG_KMH = [40, 60] as const;

/** 0 for the quiet ink, 1 from 40 km/h, 2 from 60 km/h. */
export function flowClass(ms: number): 0 | 1 | 2 {
	const kmh = ms * 3.6;
	return kmh >= FLOW_STRONG_KMH[1] ? 2 : kmh >= FLOW_STRONG_KMH[0] ? 1 : 0;
}

/** The opacity of a trail's head: a calm breeze barely shows, a strong wind reads clearly, never a solid line. */
export function flowAlpha(ms: number): number {
	return 0.2 + 0.46 * Math.min(1, ms / 15);
}

/** The number of trails for a map of this size in CSS pixels: about one per 25 x 25 pixels, between 150 and 3000. */
export function flowCount(width: number, height: number): number {
	return Math.round(Math.min(3000, Math.max(150, (width * height) / 650)));
}

/** Pixels a trail's head moves per second for a wind of 1 m/s, the same at every zoom (10 m/s: 80 px/s). */
export const FLOW_PX_PER_S = 8;
