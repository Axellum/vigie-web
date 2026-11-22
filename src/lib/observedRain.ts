// Global observed satellite precipitation layer (vigie-api `GET /v1/rain/observed`, ADR 0043):
// NASA GPM IMERG 30-minute precipitation rate estimates served as Web Mercator XYZ RGBA PNG tiles
// proxied through this site (`/data/rain-observed/tiles/<stamp>/{z}/{x}/{y}.png`) so the browser
// never talks to NASA directly. A satellite estimate (~10 km, delayed), never a ground radar or warning.
import type { Box } from './geo';
import type { RadarClass } from './radar';

export interface ObservedRainFrame {
	stamp: string;
	timeUtc: number;
	timeAt: string | null;
	/** Site proxy tile URL template (`/data/rain-observed/tiles/<stamp>/{z}/{x}/{y}.png`). */
	tiles: string;
}

export interface ObservedRain {
	status: 'ok' | 'off' | 'unavailable';
	sourceModel: string | null;
	bounds: Box;
	minZoom: number;
	maxZoom: number;
	intervalMinutes: number;
	resolutionKm: number | null;
	typicalLatencyMinutes: number | null;
	latestUtc: number | null;
	stale: boolean;
	frames: ObservedRainFrame[];
	legend: RadarClass[];
	snowLegend: RadarClass[];
	licence: string | null;
	attribution: string | null;
	note: string | null;
}

/** What MapView draws for the global observed satellite precipitation raster tile layer. */
export interface ObservedRainOnMap {
	id: string;
	tiles: string;
	minZoom: number;
	maxZoom: number;
	bounds: Box;
	attribution: string;
}

/** Default Web Mercator global bounds when the API omits them. */
export const OBSERVED_RAIN_BOUNDS: Box = [-180, -85.051129, 180, 85.051129];

/** Stamp format `YYYYMMDDHHMM` (UTC), validated strictly before proxying tiles. */
export const OBSERVED_RAIN_STAMP = /^\d{12}$/;

const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Site-relative proxy tile URL template for one observed rain frame stamp. */
export function observedRainTilePath(stamp: string): string {
	return `/data/rain-observed/tiles/${stamp}/{z}/{x}/{y}.png`;
}

function parseLegend(raw: unknown): RadarClass[] {
	const out: RadarClass[] = [];
	for (const c of Array.isArray(raw) ? raw : []) {
		const item = obj(c);
		const minMmH = num(item.min_mm_h);
		const alpha = num(item.alpha);
		if (minMmH === null || typeof item.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(item.color)) continue;
		out.push({ minMmH, color: item.color, alpha: alpha ?? 1 });
	}
	return out;
}

/** Empty disabled/off response when the API has the layer turned off or does not expose the route yet. */
export function offObservedRain(
	attribution: string | null = null,
	licence: string | null = null,
	note: string | null = null
): ObservedRain {
	return {
		status: 'off',
		sourceModel: null,
		bounds: OBSERVED_RAIN_BOUNDS,
		minZoom: 0,
		maxZoom: 6,
		intervalMinutes: 30,
		resolutionKm: null,
		typicalLatencyMinutes: null,
		latestUtc: null,
		stale: false,
		frames: [],
		legend: [],
		snowLegend: [],
		licence,
		attribution,
		note
	};
}

/** Parses `GET /v1/rain/observed`, rewriting tile URLs to this site's proxy; null for a malformed answer. */
export function observedRainFromApi(body: unknown): ObservedRain | null {
	const raw = obj(body);
	if (raw.status === 'disabled' || raw.status === 'not_configured') {
		return offObservedRain(str(raw.attribution), str(raw.licence), str(raw.note));
	}
	if (raw.status !== 'ok' && raw.status !== 'unavailable') return null;

	const frames: ObservedRainFrame[] = [];
	const seen = new Set<string>();
	for (const f of Array.isArray(raw.frames) ? raw.frames : []) {
		const item = obj(f);
		const stamp = str(item.stamp) ?? '';
		const timeUtc = num(item.time_utc);
		if (!OBSERVED_RAIN_STAMP.test(stamp) || timeUtc === null || seen.has(stamp)) continue;
		seen.add(stamp);
		frames.push({
			stamp,
			timeUtc,
			timeAt: str(item.time_at),
			tiles: observedRainTilePath(stamp)
		});
	}
	frames.sort((a, b) => a.timeUtc - b.timeUtc);

	const b = Array.isArray(raw.bounds) ? raw.bounds.map(num) : [];
	const bounds: Box = b.length === 4 && b.every((v) => v !== null) ? (b as Box) : OBSERVED_RAIN_BOUNDS;
	const minZoom = num(raw.min_zoom) ?? 0;
	const maxZoom = num(raw.max_zoom) ?? 6;
	const intervalMinutes = num(raw.interval_minutes) ?? 30;
	const resolutionKm = num(raw.resolution_km);
	const typicalLatencyMinutes = num(raw.typical_latency_minutes);
	const latestUtc = num(raw.latest_utc) ?? (frames.length ? frames[frames.length - 1].timeUtc : null);

	return {
		status: raw.status === 'ok' && frames.length > 0 ? 'ok' : 'unavailable',
		sourceModel: str(raw.source_model),
		bounds,
		minZoom,
		maxZoom,
		intervalMinutes,
		resolutionKm: resolutionKm !== null && resolutionKm > 0 ? Math.round(resolutionKm) : null,
		typicalLatencyMinutes:
			typicalLatencyMinutes !== null && typicalLatencyMinutes > 0 ? Math.round(typicalLatencyMinutes) : null,
		latestUtc,
		stale: raw.stale === true,
		frames,
		legend: parseLegend(raw.legend),
		snowLegend: parseLegend(raw.snow_legend),
		licence: str(raw.licence),
		attribution: str(raw.attribution),
		note: str(raw.note)
	};
}

/** Picks the selected frame by stamp, defaulting to the most recent observed frame available. */
export function pickObservedRainFrame(
	data: ObservedRain | null,
	stamp: string | null
): ObservedRainFrame | null {
	if (!data || data.status !== 'ok' || data.frames.length === 0) return null;
	if (stamp) {
		const found = data.frames.find((f) => f.stamp === stamp);
		if (found) return found;
	}
	return data.frames[data.frames.length - 1];
}

/** Builds the MapView raster tile overlay descriptor for the active observed rain frame. */
export function observedRainOnMap(
	data: ObservedRain | null,
	stamp: string | null,
	credit: string
): ObservedRainOnMap | null {
	const frame = pickObservedRainFrame(data, stamp);
	if (!data || !frame) return null;
	return {
		id: `observed-rain-${frame.stamp}`,
		tiles: frame.tiles,
		minZoom: data.minZoom,
		maxZoom: data.maxZoom,
		bounds: data.bounds,
		attribution: credit
	};
}

/** Formats a typical satellite latency in minutes into a concise human string (`5 h`, `4 h 30`, `45 min`). */
export function formatObservedLatency(minutes: number): string {
	const rounded = Math.max(1, Math.round(minutes));
	if (rounded < 60) return `${rounded} min`;
	const h = Math.floor(rounded / 60);
	const m = rounded % 60;
	return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
