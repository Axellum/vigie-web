// What the IGN's layers of the map share (France's national mapping agency, its Géoplateforme): where their tiles come
// from, the territories they cover, the order they are drawn in and the visitor's stored choice. The layers themselves:
//   - the relief ($lib/relief): shading, LiDAR HD and contour lines;
//   - the aerial photo ($lib/aerialPhoto), off until ticked;
//   - the details of the BD TOPO ($lib/mapDetails): foreshores, beaches and ski lifts, up close.
// The IGN draws them for France only (mainland, Corsica and the overseas departments, a few kilometres past the borders):
// each territory is a source of its own with its box, so that the map never asks for a tile outside them. The tiles come
// straight from the IGN to the visitor's browser (CORS open, kept 21 days by the browser): the site's server is not on the
// way. Licence Ouverte 2.0 (Etalab): any use, with the source.
import type { Box } from './geo';

export const IGN_HOST = 'https://data.geopf.fr';
export const IGN_TMS = `${IGN_HOST}/tms/1.0.0`;

/** Where the IGN draws its layers: one box per territory, [west, south, east, north]. */
export const IGN_TERRITORIES: { id: string; box: Box }[] = [
	{ id: 'fr', box: [-5.3, 41.3, 9.7, 51.15] }, // mainland France and Corsica
	{ id: 'antilles', box: [-61.9, 14.35, -60.75, 16.55] }, // Guadeloupe and Martinique
	{ id: 'guyane', box: [-54.65, 2.1, -51.6, 5.8] },
	{ id: 'reunion', box: [55.2, -21.42, 55.86, -20.85] },
	{ id: 'mayotte', box: [44.95, -13.05, 45.35, -12.6] },
	{ id: 'spm', box: [-56.45, 46.7, -56.1, 47.15] } // Saint-Pierre-et-Miquelon
];

/** The closest the site's maps go (MapView.svelte): the BD TOPO's details, the LiDAR HD and the photo are seen there. */
export const MAP_MAX_ZOOM = 16;

export type MapTheme = 'light' | 'dark';

/** The ids of the map's layers and sources of each IGN layer start with these, from the bottom of the map up. */
export const PHOTO_PREFIX = 'photo-';
export const RELIEF_PREFIX = 'relief-';
export const DETAILS_PREFIX = 'details-';
const ORDER = [PHOTO_PREFIX, RELIEF_PREFIX, DETAILS_PREFIX];

const isIgn = (id: string) => ORDER.some((prefix) => id.startsWith(prefix));

type Layer = { id: string; type: string };

/**
 * The layer the IGN layer of `prefix` goes under: the first IGN layer drawn above it or, failing that, the first line (rivers,
 * then roads and borders) or label of the base map. The photo, the relief and the details then lie over the land, the water
 * and the woods, under everything else, in this order whichever is added first.
 */
export function ignBefore(layers: Layer[], prefix: string): string | undefined {
	const above = ORDER.slice(ORDER.indexOf(prefix) + 1);
	return layers.find(
		(l) =>
			above.some((p) => l.id.startsWith(p)) || (!isIgn(l.id) && (l.type === 'line' || l.type === 'symbol'))
	)?.id;
}

/**
 * The layer the names of the details go under: the one right above the base map's last layer (`baseTop`), the details'
 * own skipped. The names are then read over the base map's names and the rain, and under the site's own markers. Undefined
 * (the top of the map) when the base map's last layer is not known.
 */
export function overBaseMap(layers: Layer[], baseTop: string | undefined): string | undefined {
	const at = layers.findIndex((l) => l.id === baseTop);
	if (at < 0) return undefined;
	return layers.slice(at + 1).find((l) => !l.id.startsWith(DETAILS_PREFIX))?.id;
}

/** The visitor's choice of the IGN's layers: the relief and the details on, the contour lines and the photo off. */
export interface IgnChoice {
	/** The relief (named `on` since it was the only IGN layer: the stored choices keep the name). */
	on: boolean;
	contours: boolean;
	photo: boolean;
	details: boolean;
}

export const IGN_DEFAULT: IgnChoice = { on: true, contours: false, photo: false, details: true };

/** The stored choice; anything unreadable gives the default, and a choice stored before a layer existed gets its default. */
export function parseIgnChoice(raw: string | null): IgnChoice {
	try {
		const v = JSON.parse(raw ?? '') as Partial<Record<keyof IgnChoice, unknown>> | null;
		if (!v || typeof v !== 'object') return { ...IGN_DEFAULT };
		return {
			on: v.on !== false,
			contours: v.contours === true,
			photo: v.photo === true,
			details: v.details !== false
		};
	} catch {
		return { ...IGN_DEFAULT };
	}
}
