// The IGN's aerial photo (BD ORTHO, `ORTHOIMAGERY.ORTHOPHOTOS`) as the ground of the map, when the visitor ticks it: over
// the land colours of the base map, under the relief and everything else, in France only (one source per territory,
// $lib/ign). Out at sea the IGN's tiles are white where it has no photo: the base map's water is drawn again over the photo
// (`waterOverPhoto`), so that the sea keeps its colour and the coast its line. The base map's buildings are hidden while
// the photo is on (`buildingsOverPhoto`); its roads and names stay.
import type { Box } from './geo';
import { IGN_TERRITORIES, IGN_TMS, PHOTO_PREFIX, type MapTheme } from './ign';

/** What the page gives the map: null when the photo is off. */
export interface PhotoOnMap {
	/** The credit shown by the map's attribution while the photo is drawn. */
	credit: string;
}

/** Below this zoom the photo of France is a few pixels: nothing is asked. */
export const PHOTO_MIN_ZOOM = 6;

export interface PhotoPiece {
	id: string;
	source: {
		type: 'raster';
		tiles: string[];
		tileSize: 256;
		minzoom: number;
		maxzoom: number;
		bounds: Box;
		attribution: string;
	};
	layer: { id: string; type: 'raster'; source: string; minzoom: number; paint: Record<string, unknown> };
}

/** The sources and layers of the photo, one per territory. In the dark theme it is dimmed a little, as the rest of the map. */
export function photoPieces(photo: PhotoOnMap, theme: MapTheme): PhotoPiece[] {
	return IGN_TERRITORIES.map((territory) => {
		const id = `${PHOTO_PREFIX}${territory.id}`;
		return {
			id,
			source: {
				type: 'raster',
				tiles: [`${IGN_TMS}/ORTHOIMAGERY.ORTHOPHOTOS/{z}/{x}/{y}.jpeg`],
				tileSize: 256,
				minzoom: 0,
				maxzoom: 19,
				bounds: territory.box,
				attribution: photo.credit
			},
			layer: {
				id,
				type: 'raster',
				source: id,
				minzoom: PHOTO_MIN_ZOOM,
				paint: {
					...(theme === 'dark' ? { 'raster-brightness-max': 0.85 } : {}),
					'raster-fade-duration': 0
				}
			}
		};
	});
}

type StyleLayer = {
	id: string;
	type: string;
	'source-layer'?: string;
	minzoom?: number;
	layout?: Record<string, unknown>;
	paint?: Record<string, unknown>;
};

/**
 * The base map's buildings (its layers of the `building` source layer) that are shown: drawn over the photo, from zoom 13
 * they would hide its roofs (white blocks in the light theme, black ones in the dark). The map hides them while the photo is
 * on.
 */
export function buildingsOverPhoto(layers: StyleLayer[]): string[] {
	return layers
		.filter((l) => l['source-layer'] === 'building' && l.layout?.visibility !== 'none')
		.map((l) => l.id);
}

/**
 * The base map's water (its fill layers of the `water` source layer, the sea and the lakes) drawn again over the photo:
 * the same layers under other ids, opaque and visible, from the zoom the photo starts at.
 */
export function waterOverPhoto<L extends StyleLayer>(layers: L[]): L[] {
	return layers
		.filter((l) => l.type === 'fill' && l['source-layer'] === 'water' && !l.id.startsWith(PHOTO_PREFIX))
		.map((l) => ({
			...l,
			id: `${PHOTO_PREFIX}water-${l.id}`,
			minzoom: Math.max(l.minzoom ?? 0, PHOTO_MIN_ZOOM),
			layout: { ...l.layout, visibility: 'visible' },
			paint: { ...l.paint, 'fill-opacity': 1 }
		}));
}
