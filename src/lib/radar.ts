// The rain radar of Météo-France over metropolitan France and three overseas areas (vigie-api `GET /v1/radar/{area}`, its ADR 0030
// and 0037): a mosaic measured every 5 minutes, drawn by the API as map tiles in intensity classes. Measured rain, never a forecast
// and never a warning.
// The site shows the last half hour as a small card on the map: a button that plays the images, a slider, the legend.
import { boxesOverlap, type Box } from './geo';

/** The images kept for the animation: the last 35 minutes (8 images, 5 minutes apart). The API lists more. */
export const RADAR_FRAMES = 8;

/** The box of metropolitan France (the same as the "France" shortcut of the map): the radar says nothing elsewhere. */
export const RADAR_FRANCE: Box = [-5.5, 41.2, 9.8, 51.3];

/** The areas of the API's radar (`GET /v1/radar/{area}`), with the box of each mosaic's grid (the API's own boxes, its ADR 0037). */
export type RadarArea = 'france' | 'antilles' | 'reunion' | 'new-caledonia';
export const RADAR_AREAS: Record<RadarArea, Box> = {
	france: RADAR_FRANCE,
	antilles: [-66, 10.59, -57, 21],
	reunion: [51, -25.02, 62.02, -16],
	'new-caledonia': [159.7, -27.27, 171.58, -16.2]
};

/** The refresh of the list of images: an image comes every 5 minutes, so the list is not asked again before. */
export const RADAR_REFRESH_MS = 300_000;

export interface RadarClass {
	/** The class starts at this rain rate (mm/h). */
	minMmH: number;
	color: string;
	alpha: number;
}

export interface Radar {
	/** The epoch seconds of the images kept, the oldest first (`RADAR_FRAMES` at most). */
	frames: number[];
	intervalMinutes: number;
	minZoom: number;
	maxZoom: number;
	bounds: Box;
	legend: RadarClass[];
	attribution: string | null;
}

/** One +5..+60 min frame from Météo-France PIAF rain nowcast (`GET /v1/radar/france/nowcast`). */
export interface RadarNowcastFrame {
	epoch: number;
	leadMinutes: number;
}

export interface RadarNowcast {
	runUtc: number | null;
	frames: RadarNowcastFrame[];
	intervalMinutes: number;
	minZoom: number;
	maxZoom: number;
	bounds: Box;
	legend: RadarClass[];
	attribution: string | null;
	note: string | null;
}

/** Unified frame in the radar timeline (either observed mosaic or PIAF +1 h forecast). */
export interface RadarTimelineFrame {
	epoch: number;
	kind: 'observed' | 'nowcast';
	leadMinutes: number | null;
}

const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The answer of the API for the site; null when there is no image to show (a gateway that is down, an unknown answer). */
export function radarFromApi(body: unknown): Radar | null {
	const raw = obj(body);
	if (raw.status !== 'ok' || !Array.isArray(raw.frames)) return null;
	const epochs = raw.frames
		.map((f) => num(obj(f).epoch))
		.filter((e): e is number => e !== null)
		.sort((a, b) => a - b);
	if (epochs.length === 0) return null;
	const legend: RadarClass[] = [];
	for (const c of Array.isArray(raw.legend) ? raw.legend : []) {
		const item = obj(c);
		const minMmH = num(item.min_mm_h);
		const alpha = num(item.alpha);
		if (minMmH === null || typeof item.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(item.color)) continue;
		legend.push({ minMmH, color: item.color, alpha: alpha ?? 1 });
	}
	if (legend.length === 0) return null;
	const b = Array.isArray(raw.bounds) ? raw.bounds.map(num) : [];
	const bounds: Box =
		b.length === 4 && b.every((x) => x !== null) ? (b as Box) : [-9.97, 37.45, 17.57, 53.67];
	return {
		frames: epochs.slice(-RADAR_FRAMES),
		intervalMinutes: num(raw.interval_minutes) ?? 5,
		minZoom: num(raw.min_zoom) ?? 3,
		maxZoom: num(raw.max_zoom) ?? 10,
		bounds,
		legend,
		attribution: typeof raw.attribution === 'string' ? raw.attribution : null
	};
}

/** The answer of `GET /v1/radar/france/nowcast`; null when unavailable, unconfigured, or empty. */
export function radarNowcastFromApi(body: unknown): RadarNowcast | null {
	const raw = obj(body);
	if (raw.status !== 'ok' || !Array.isArray(raw.frames)) return null;
	const frames: RadarNowcastFrame[] = [];
	for (const f of raw.frames) {
		const item = obj(f);
		const epoch = num(item.epoch);
		const leadMinutes = num(item.lead_minutes);
		if (epoch === null || leadMinutes === null || leadMinutes <= 0) continue;
		frames.push({ epoch, leadMinutes: Math.round(leadMinutes) });
	}
	frames.sort((a, b) => a.epoch - b.epoch);
	if (frames.length === 0) return null;
	const legend: RadarClass[] = [];
	for (const c of Array.isArray(raw.legend) ? raw.legend : []) {
		const item = obj(c);
		const minMmH = num(item.min_mm_h);
		const alpha = num(item.alpha);
		if (minMmH === null || typeof item.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(item.color)) continue;
		legend.push({ minMmH, color: item.color, alpha: alpha ?? 1 });
	}
	const b = Array.isArray(raw.bounds) ? raw.bounds.map(num) : [];
	const bounds: Box = b.length === 4 && b.every((x) => x !== null) ? (b as Box) : [-6, 41, 10.5, 51.5];
	return {
		runUtc: num(raw.run_utc),
		frames,
		intervalMinutes: num(raw.interval_minutes) ?? 5,
		minZoom: num(raw.min_zoom) ?? 3,
		maxZoom: num(raw.max_zoom) ?? 10,
		bounds,
		legend,
		attribution: typeof raw.attribution === 'string' ? raw.attribution : null,
		note: typeof raw.note === 'string' ? raw.note : null
	};
}

/** A radar area of the API from the text of an address; null for an unknown one. */
export const radarAreaFrom = (value: string): RadarArea | null =>
	Object.hasOwn(RADAR_AREAS, value) ? (value as RadarArea) : null;

/** The address of the tiles of one image, on the site (it relays the API's: `/data/radar/...`). */
export const radarTiles = (area: RadarArea, epoch: number): string =>
	`/data/radar/${area}/${epoch}/{z}/{x}/{y}.png`;

/** The address of the tiles of one PIAF nowcast image on the site. */
export const radarNowcastTiles = (epoch: number): string =>
	`/data/radar/france/nowcast/tiles/${epoch}/{z}/{x}/{y}.png`;

/** What the map draws of the radar (`MapView`'s `radar` prop). */
export interface RadarOnMap {
	frames: {
		epoch: number;
		tiles: string;
		kind?: 'observed' | 'nowcast';
		bounds?: Box;
		minZoom?: number;
		maxZoom?: number;
	}[];
	/** The epoch of the image shown. */
	active: number;
	/** Every image is loaded, not only the one shown. */
	preload: boolean;
	minZoom: number;
	maxZoom: number;
	bounds: Box;
	attribution: string;
}

/**
 * The area whose radar the card shows: close enough for the tiles (they start at `minZoom`), and either on France (any overlap, as
 * the card always did) or with the centre of the view inside an overseas mosaic (a small island in a view of a whole ocean is not
 * worth a card). Null when the card is not shown.
 */
export function radarAreaOf(view: Box | null, zoom: number, minZoom: number): RadarArea | null {
	if (view === null || zoom < minZoom) return null;
	if (boxesOverlap(view, RADAR_FRANCE)) return 'france';
	const [west, south, east, north] = view;
	const lat = (south + north) / 2;
	// A view that crosses the antimeridian has its east above 180: bring the centre back into -180..180.
	let lon = (west + east) / 2;
	if (lon > 180) lon -= 360;
	for (const area of ['antilles', 'reunion', 'new-caledonia'] as const) {
		const [w, s, e, n] = RADAR_AREAS[area];
		if (lon >= w && lon <= e && lat >= s && lat <= n) return area;
	}
	return null;
}

/** A rain rate for a label: "0,1" in French, "0.1" in English; whole numbers without a decimal. */
export function rate(lang: 'fr' | 'en', mmH: number): string {
	return mmH.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 });
}

/** The time of an image in the reader's time zone ("10:35"), as the rest of the site shows times. */
export function radarTime(lang: 'fr' | 'en', epoch: number, timeZone?: string): string {
	return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone
	}).format(new Date(epoch * 1000));
}
