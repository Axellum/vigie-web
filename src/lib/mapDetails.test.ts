import { describe, expect, it } from 'vitest';
import { DETAILS_PREFIX, IGN_TERRITORIES } from './ign';
import { DETAILS_FROM_ZOOM, detailsPieces } from './mapDetails';

const details = {
	credit: 'BD TOPO © IGN',
	lifts: { chairlift: 'Chairlift', gondola: 'Gondola', other: 'Ski lift' }
};
const colors = {
	foreshore: '#d8c79a',
	foreshoreLine: '#b29d63',
	beach: '#e3b341',
	beachInk: '#6b5413',
	lift: '#2b3640',
	halo: '#f9fbfc'
};

describe('detailsPieces', () => {
	it("asks the IGN's BD TOPO of each territory only, from zoom 15", () => {
		const { sources } = detailsPieces(details, 'light', colors);
		expect(sources.map((s) => s.id)).toEqual(IGN_TERRITORIES.map((t) => `${DETAILS_PREFIX}${t.id}`));
		for (const { id, source } of sources) {
			expect(source.bounds).toEqual(IGN_TERRITORIES.find((t) => id.endsWith(`-${t.id}`))?.box);
			expect(source.tiles).toEqual(['https://data.geopf.fr/tms/1.0.0/BDTOPO/{z}/{x}/{y}.pbf']);
			expect(source.minzoom).toBe(DETAILS_FROM_ZOOM);
			expect(source.attribution).toBe('BD TOPO © IGN');
		}
	});

	it('draws the foreshores and the cables under the roads, the beaches and the names over the names', () => {
		const { under, over } = detailsPieces(details, 'light', colors);
		const kinds = (layers: { id: string }[]) => [
			...new Set(layers.map((l) => l.id.replace(/^details-[a-z]+-/, '')))
		];
		expect(kinds(under)).toEqual(['foreshore', 'foreshore-edge', 'lift']);
		expect(kinds(over)).toEqual(['beach', 'beach-name', 'lift-name']);
		const all = [...under, ...over];
		expect(all).toHaveLength(6 * IGN_TERRITORIES.length);
		for (const layer of all) {
			expect(layer.id.startsWith(`${layer.source}-`)).toBe(true);
			expect(layer.minzoom).toBe(DETAILS_FROM_ZOOM);
		}
		expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
		const sourceLayers = new Set(all.map((l) => l['source-layer']));
		expect([...sourceLayers].sort()).toEqual(['detail_orographique', 'transport_par_cable', 'zone_d_estran']);
	});

	it('names a lift by its own name, or by its kind in the page language', () => {
		const { over } = detailsPieces(details, 'light', colors);
		const field = JSON.stringify(
			(over.find((l) => l.id.endsWith('lift-name'))?.layout as Record<string, unknown>)['text-field']
		);
		expect(field).toContain('"toponyme"');
		for (const word of ['Chairlift', 'Gondola', 'Ski lift', 'Télésiège', 'Télécabine, téléphérique']) {
			expect(field).toContain(`"${word}"`);
		}
	});

	it('takes its colours from the tokens given, the foreshore fainter in the dark theme', () => {
		const fill = (theme: 'light' | 'dark') =>
			detailsPieces(details, theme, colors).under.find((l) => l.id.endsWith('-foreshore'))?.paint as Record<
				string,
				unknown
			>;
		expect(fill('light')['fill-color']).toBe('#d8c79a');
		expect(fill('light')['fill-opacity']).toBe(0.55);
		expect(fill('dark')['fill-opacity']).toBe(0.45);
	});
});
