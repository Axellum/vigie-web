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

/** What MapView draws for the forecast rain overlay. */
export interface RainFieldOnMap {
	id: string;
	level: RainLevelId;
	url: string;
	/** Four [lon, lat] corners for MapLibre `image` source: [NW, NE, SE, SW]. */
	coordinates: [[number, number], [number, number], [number, number], [number, number]];
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

/** Clamps latitudes to Web Mercator limits and returns MapLibre `image` source corners `[NW, NE, SE, SW]`. */
export function imageCoordinates(
	bounds: Box
): [[number, number], [number, number], [number, number], [number, number]] {
	const [west, southRaw, east, northRaw] = bounds;
	const south = Math.max(-85.051129, Math.min(85.051129, southRaw));
	const north = Math.max(-85.051129, Math.min(85.051129, northRaw));
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
				attribution: credit
			}
		};
	}
	return null;
}
