// The rain radar of Météo-France over metropolitan France (vigie-api `GET /v1/radar/france`, its ADR 0030): a mosaic measured
// every 5 minutes, drawn by the API as map tiles in intensity classes. Measured rain, never a forecast and never a warning.
// The site shows the last half hour as a small card on the map: a button that plays the images, a slider, the legend.
import { boxesOverlap, type Box } from './geo';

/** The images kept for the animation: the last 35 minutes (8 images, 5 minutes apart). The API lists more. */
export const RADAR_FRAMES = 8;

/** The box of metropolitan France (the same as the "France" shortcut of the map): the radar says nothing elsewhere. */
export const RADAR_FRANCE: Box = [-5.5, 41.2, 9.8, 51.3];

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

/** The address of the tiles of one image, on the site (it relays the API's: `/data/radar/...`). */
export const radarTiles = (epoch: number): string => `/data/radar/${epoch}/{z}/{x}/{y}.png`;

/** What the map draws of the radar (`MapView`'s `radar` prop). */
export interface RadarOnMap {
	frames: { epoch: number; tiles: string }[];
	/** The epoch of the image shown. */
	active: number;
	/** Every image is loaded, not only the one shown. */
	preload: boolean;
	minZoom: number;
	maxZoom: number;
	bounds: Box;
	attribution: string;
}

/** Whether the card is worth showing: the view is on France and close enough for the tiles (they start at `minZoom`). */
export function radarInView(view: Box | null, zoom: number, minZoom: number): boolean {
	return view !== null && zoom >= minZoom && boxesOverlap(view, RADAR_FRANCE);
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
