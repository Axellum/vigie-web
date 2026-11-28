// Three details of the IGN's BD TOPO that the base map does not draw, from zoom 15 (the IGN's vector tiles hold them from
// there): the foreshores (`zone_d_estran`, the sand and rocks the tide uncovers), the beaches (`detail_orographique` of
// nature "Plage", a point with its name) and the ski lifts and cable cars (`transport_par_cable`, with their names). France
// only, one source per territory ($lib/ign); on until the visitor turns them off.
// The foreshores and the cables lie with the relief, under the roads of the base map; the beaches' points and the names over
// the base map's names, under the site's own markers.
import type { Box } from './geo';
import { DETAILS_PREFIX, IGN_TERRITORIES, IGN_TMS, type MapTheme } from './ign';

/** What the page gives the map: null when the details are off. */
export interface DetailsOnMap {
	/** The credit shown by the map's attribution while the details are drawn. */
	credit: string;
	/** The name of a lift that has none of its own, by its kind, in the page's language. */
	lifts: { chairlift: string; gondola: string; other: string };
}

/** The colours of the details, from the site's tokens (`--map-foreshore`…, app.css). */
export interface DetailsColors {
	foreshore: string;
	foreshoreLine: string;
	beach: string;
	beachInk: string;
	lift: string;
	halo: string;
}

/** The IGN's vector tiles hold the details from this zoom. */
export const DETAILS_FROM_ZOOM = 15;

export interface DetailsSource {
	type: 'vector';
	tiles: string[];
	minzoom: number;
	maxzoom: number;
	bounds: Box;
	attribution: string;
}

type Layer = Record<string, unknown> & { id: string; type: string; source: string };

export interface DetailsPieces {
	sources: { id: string; source: DetailsSource }[];
	/** Under the roads of the base map: the foreshores and the cables. */
	under: Layer[];
	/** Over the base map's names: the beaches and the names. */
	over: Layer[];
}

const FONT = ['Noto Sans Regular'];
// A text that is empty when the IGN gives no name.
const named = ['to-string', ['get', 'toponyme']];
const hasName = ['>', ['length', named], 0];

export function detailsPieces(details: DetailsOnMap, theme: MapTheme, colors: DetailsColors): DetailsPieces {
	const pieces: DetailsPieces = { sources: [], under: [], over: [] };
	const beach = ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'nature'], 'Plage']];
	for (const territory of IGN_TERRITORIES) {
		const source = `${DETAILS_PREFIX}${territory.id}`;
		pieces.sources.push({
			id: source,
			source: {
				type: 'vector',
				tiles: [`${IGN_TMS}/BDTOPO/{z}/{x}/{y}.pbf`],
				minzoom: DETAILS_FROM_ZOOM,
				maxzoom: 16,
				bounds: territory.box,
				attribution: details.credit
			}
		});
		const base = { source, minzoom: DETAILS_FROM_ZOOM };
		pieces.under.push(
			{
				...base,
				id: `${source}-foreshore`,
				type: 'fill',
				'source-layer': 'zone_d_estran',
				paint: { 'fill-color': colors.foreshore, 'fill-opacity': theme === 'dark' ? 0.45 : 0.55 }
			},
			{
				...base,
				id: `${source}-foreshore-edge`,
				type: 'line',
				'source-layer': 'zone_d_estran',
				paint: { 'line-color': colors.foreshoreLine, 'line-width': 0.8, 'line-dasharray': [2, 2] }
			},
			{
				...base,
				id: `${source}-lift`,
				type: 'line',
				'source-layer': 'transport_par_cable',
				paint: { 'line-color': colors.lift, 'line-width': 1.6 }
			}
		);
		pieces.over.push(
			{
				...base,
				id: `${source}-beach`,
				type: 'circle',
				'source-layer': 'detail_orographique',
				filter: beach,
				paint: {
					'circle-radius': 5,
					'circle-color': colors.beach,
					'circle-stroke-width': 1.5,
					'circle-stroke-color': colors.halo
				}
			},
			{
				...base,
				id: `${source}-beach-name`,
				type: 'symbol',
				'source-layer': 'detail_orographique',
				filter: ['all', beach, hasName],
				layout: {
					'text-field': named,
					'text-font': FONT,
					'text-size': 12,
					'text-offset': [0, 1.1],
					'text-anchor': 'top'
				},
				paint: { 'text-color': colors.beachInk, 'text-halo-color': colors.halo, 'text-halo-width': 1.2 }
			},
			{
				...base,
				id: `${source}-lift-name`,
				type: 'symbol',
				'source-layer': 'transport_par_cable',
				layout: {
					'symbol-placement': 'line',
					'text-field': [
						'case',
						hasName,
						named,
						[
							'match',
							['get', 'nature'],
							'Télésiège',
							details.lifts.chairlift,
							'Télécabine, téléphérique',
							details.lifts.gondola,
							details.lifts.other
						]
					],
					'text-font': FONT,
					'text-size': 11
				},
				paint: { 'text-color': colors.lift, 'text-halo-color': colors.halo, 'text-halo-width': 1.2 }
			}
		);
	}
	return pieces;
}
