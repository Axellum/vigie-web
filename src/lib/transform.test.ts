import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hazardsFromApi, pickText, roundGeometry, shapeKey, slug, warningsFromApi } from './transform';

const fixture = (name: string): unknown =>
	JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', `${name}.json`), 'utf-8'));

describe('hazardsFromApi', () => {
	it('keeps every point hazard of a real answer, with its own values', () => {
		const raw = fixture('hazards') as { features: { id: string; properties: Record<string, unknown> }[] };
		const data = hazardsFromApi(raw);
		expect(data.items.length).toBe(raw.features.length);
		const first = raw.features[0];
		const item = data.items.find((h) => h.id === first.id)!;
		expect(item.title).toBe(first.properties.title);
		expect(item.level).toBe(first.properties.severity);
		expect(item.value).toBe(first.properties.value_primary ?? null);
		expect(data.attribution).toBeTruthy();
	});

	it('leaves unknown values null instead of filling them', () => {
		const data = hazardsFromApi({
			features: [
				{
					type: 'Feature',
					id: 'x1',
					geometry: { type: 'Point', coordinates: [1, 2] },
					properties: { title: 'T' }
				}
			]
		});
		expect(data.items[0]).toMatchObject({
			level: null,
			value: null,
			unit: null,
			depthKm: null,
			tsunami: null,
			time: null
		});
	});

	it('drops a feature with no id, no title or no point', () => {
		const data = hazardsFromApi({
			features: [
				{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { title: 'no id' } },
				{ type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
				{ type: 'Feature', id: 'b', geometry: null, properties: { title: 'no point' } }
			]
		});
		expect(data.items).toEqual([]);
	});
});

describe('warningsFromApi', () => {
	it('shares one shape between the warnings of the same territory', () => {
		const raw = fixture('warnings-FR') as {
			features: { geometry: unknown; properties: Record<string, unknown> }[];
		};
		const { data, details } = warningsFromApi('FR', raw);
		expect(data.warnings.length).toBe(raw.features.length);
		expect(details.size).toBe(raw.features.length);
		const placed = raw.features.filter((f) => f.geometry).length;
		expect(data.warnings.filter((w) => w.shape).length).toBe(placed);
		expect(Object.keys(data.shapes).length).toBeLessThanOrEqual(placed);
		for (const w of data.warnings) if (w.shape) expect(data.shapes[w.shape]).toBeDefined();
	});

	it('keeps the official texts unchanged', () => {
		const raw = fixture('warnings-FR') as { features: { properties: Record<string, unknown> }[] };
		const { details } = warningsFromApi('FR', raw);
		for (const f of raw.features) {
			const texts = f.properties.texts as { description?: string | null; instruction?: string | null }[];
			const detail = [...details.values()].find(
				(d) =>
					d.identifier === f.properties.identifier &&
					d.area === ((f.properties.area as { description?: string }).description ?? null)
			)!;
			texts.forEach((text, i) => {
				expect(detail.texts[i].description).toBe(text.description ?? null);
				expect(detail.texts[i].instruction).toBe(text.instruction ?? null);
			});
		}
	});

	it('gives each area of a message its own id', () => {
		const raw = fixture('warnings-FR') as { features: { properties: Record<string, unknown> }[] };
		const { data } = warningsFromApi('FR', raw);
		expect(new Set(data.warnings.map((w) => w.id)).size).toBe(raw.features.length);
	});

	it('lists the warnings that cannot be placed, with no shape', () => {
		const { data } = warningsFromApi('US', fixture('warnings-US'));
		expect(data.warnings.some((w) => w.shape === null)).toBe(true);
	});

	it('reads the coverage of an unavailable source', () => {
		const { data } = warningsFromApi('CA', fixture('warnings-CA'));
		expect(data.coverage.length).toBeGreaterThan(0);
		expect(data.coverage[0].country).toBe('CA');
	});
});

describe('helpers', () => {
	it('shapeKey groups by territory code, else by warning', () => {
		expect(shapeKey('a', 'geocode:NUTS3:FR832')).toBe('geocode:NUTS3:FR832');
		expect(shapeKey('a', 'polygon')).toBe('w:a');
		expect(shapeKey('a', null)).toBe('w:a');
	});

	it('pickText prefers the reader language, then English, and never invents one', () => {
		const texts = [
			{ language: 'de-DE', headline: 'de' },
			{ language: 'en', headline: 'en' },
			{ language: 'fr', headline: 'fr' }
		];
		expect(pickText(texts, 'fr')?.headline).toBe('fr');
		expect(pickText(texts.slice(0, 2), 'fr')?.headline).toBe('en');
		expect(pickText([texts[0]], 'fr')?.headline).toBe('de');
		expect(pickText([], 'fr')).toBeNull();
	});

	it('roundGeometry rounds nested coordinates', () => {
		const g = roundGeometry({ type: 'LineString', coordinates: [[1.23456, 2.34567]] });
		expect(g).toEqual({ type: 'LineString', coordinates: [[1.235, 2.346]] });
	});

	it('slug removes accents and punctuation', () => {
		expect(slug('Pyrénées-Atlantiques')).toBe('pyrenees-atlantiques');
		expect(slug("Côte-d'Or")).toBe('cote-d-or');
	});
});
