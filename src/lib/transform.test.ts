import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	firesFromApi,
	forecastFromApi,
	hazardsFromApi,
	pickText,
	pointFromApi,
	roundGeometry,
	servedFromApi,
	uncoveredFromApi,
	shapeKey,
	slug,
	warningsFromApi
} from './transform';

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

describe('pointFromApi', () => {
	it('keeps the values of a real answer as they are', () => {
		const raw = fixture('point') as Record<string, any>;
		const point = pointFromApi(raw);
		expect(point.lat).toBe(raw.coordinates.lat);
		expect(point.lon).toBe(raw.coordinates.lon);
		expect(point.current?.tempC).toBe(raw.current.temp_c);
		expect(point.current?.code).toBe(raw.current.weather_code);
		expect(point.daily.length).toBe(raw.daily.length);
		expect(point.daily[0].tmaxC).toBe(raw.daily[0].tmax);
		expect(point.rain?.mmPerStep).toEqual(raw.rain_nowcast.mm_per_step);
		expect(point.air?.eaqi).toBe(raw.air_quality.european_aqi);
		expect(point.river?.maxM3s).toBe(raw.flood_risk.river_discharge_max_m3s);
		expect(point.attribution).toBe(raw.weather_attribution);
	});

	it('leaves out the radar and the heuristic flood level, and keeps unknown blocks null', () => {
		const point = pointFromApi({
			coordinates: { lat: 1, lon: 2 },
			current: null,
			daily: [{ date: '2026-10-20' }, { code: 3 }],
			rain_nowcast: { radar_tile_url_template: 'https://example.org/{z}', mm_per_step: null },
			flood_risk: { flood_alert_level: 'RED', river_discharge_m3s: 3 },
			space_weather: { solar_kp: 2 }
		});
		expect(point.current).toBeNull();
		expect(point.daily).toEqual([
			{
				date: '2026-10-20',
				code: null,
				tminC: null,
				tmaxC: null,
				rainMm: null,
				rainProbabilityPct: null,
				windMaxKmh: null,
				uvMax: null
			}
		]);
		expect(JSON.stringify(point)).not.toContain('example.org');
		expect(JSON.stringify(point)).not.toContain('RED');
		expect(point.rain?.mmPerStep).toBeNull();
		expect(point.river).toEqual({
			todayM3s: 3,
			meanM3s: null,
			maxM3s: null,
			stale: false,
			attribution: null
		});
		expect(point.air).toBeNull();
		expect(point.marine).toBeNull();
		expect(point.space?.kp).toBe(2);
	});
});

describe('forecastFromApi', () => {
	it('keeps the cone, the track, the positions and the warnings of a real storm advisory', () => {
		const raw = fixture('forecast-nhc_al092026') as Record<string, any>;
		const forecast = forecastFromApi('nhc_al092026', raw);
		const kinds = forecast.features.features.map((f) => f.properties?.kind);
		expect(kinds.filter((k) => k === 'cone').length).toBe(1);
		expect(kinds.filter((k) => k === 'track').length).toBe(1);
		expect(kinds.filter((k) => k === 'position').length).toBe(5);
		expect(kinds.filter((k) => k === 'watch_warning').length).toBe(3);
		expect(forecast.advisory).toBe('13A');
		expect(forecast.issued).toBe(raw.issued_utc);
		expect(forecast.advisoryUrl).toBe(raw.advisory_url);
		expect(forecast.bbox).toEqual(raw.bbox);
		expect(forecast.attribution).toContain('National Hurricane Center');
		const first = forecast.features.features.find((f) => f.properties?.kind === 'position')!;
		expect(first.properties?.wind_kt).toBe(95);
		expect(forecast.messages).toEqual([]);
	});

	it('keeps the arrival times of a tsunami and the official messages it comes from', () => {
		const forecast = forecastFromApi('tsunami_pheb_26282000', fixture('forecast-tsunami_pheb_26282000'));
		const eta = forecast.features.features.filter((f) => f.properties?.kind === 'eta');
		expect(eta.length).toBe(4);
		expect(eta.every((f) => typeof f.properties?.eta_utc === 'number')).toBe(true);
		expect(forecast.messages).toEqual(['PHEB-3-26282000']);
	});

	it('says why there is nothing, and frames nothing', () => {
		const forecast = forecastFromApi('x', { features: [], reason: 'No forecast for this hazard' });
		expect(forecast.features.features).toEqual([]);
		expect(forecast.reason).toBe('No forecast for this hazard');
		expect(forecast.bbox).toBeNull();
	});
});

describe('hazardsFromApi and forecasts', () => {
	it('reads has_forecast, false when the API does not say', () => {
		const data = hazardsFromApi(fixture('hazards-storms'));
		expect(data.items.map((h) => [h.id, h.hasForecast])).toEqual([
			['nhc_al092026', true],
			['tsunami_pheb_26282000', true]
		]);
		expect(hazardsFromApi(fixture('hazards')).items.every((h) => h.hasForecast === false)).toBe(true);
	});
});

describe('servedFromApi', () => {
	it('keeps the countries of a real answer, with their sources and licence', () => {
		const raw = fixture('vigilances-countries') as unknown as Record<string, unknown>[];
		const served = servedFromApi(raw);
		// With ?uncovered=true the answer lists every country; only the covered ones are served.
		expect(served.length).toBe(raw.filter((c) => c.covered !== false).length);
		expect(served.length).toBeGreaterThan(0);
		expect(served.map((c) => c.country)).toContain('MX');
		expect(served.find((c) => c.country === 'NZ')?.licenceVerified).toBe(false);
		expect(served.find((c) => c.country === 'FR')?.licenceVerified).toBe(true);
	});

	it('drops an entry with no valid code and reads a missing licence as not confirmed', () => {
		expect(servedFromApi({ not: 'a list' })).toEqual([]);
		expect(servedFromApi([{ country: 'fr', sources: ['x', 3] }, { country: 'France' }, {}])).toEqual([
			{ country: 'FR', sources: ['x'], licenceVerified: false }
		]);
	});

	it('lists the countries the API does not serve, with its reason', () => {
		const raw = fixture('vigilances-countries') as unknown as Record<string, unknown>[];
		const uncovered = uncoveredFromApi(raw);
		expect(uncovered.length).toBe(raw.filter((c) => c.covered === false).length);
		const served = new Set(servedFromApi(raw).map((c) => c.country));
		expect(uncovered.some((u) => served.has(u.country))).toBe(false);
		const jp = raw.find((c) => c.country === 'JP');
		expect(uncovered.find((u) => u.country === 'JP')).toEqual({
			country: 'JP',
			reasonCode: jp?.reason_code ?? null,
			reason: jp?.reason ?? null
		});
		expect(
			uncoveredFromApi([
				{ country: 'JP', covered: true },
				{ country: 'X', covered: false }
			])
		).toEqual([]);
	});
});

describe('fires', () => {
	it('sums up the fires near a point as the API gave them, nothing near meaning zero', () => {
		const raw = fixture('point') as Record<string, any>;
		const point = pointFromApi(raw);
		expect(point.fires?.count).toBe(raw.fires_nearby.count_24h);
		expect(point.fires?.radiusKm).toBe(raw.fires_nearby.radius_km);
		expect(point.fires?.nearestKm).toBe(raw.fires_nearby.nearest_km ?? null);
		expect(point.fires?.attribution).toContain('FIRMS');
		expect(point.fires?.disclaimer).toBeTruthy();
		expect(pointFromApi({ fires_nearby: null }).fires).toBeNull();
		const near = pointFromApi({
			fires_nearby: {
				radius_km: 50,
				count_24h: 82,
				nearest_km: 11,
				max_frp_mw: 73.12,
				latest_utc: 1792497060
			}
		}).fires;
		expect(near).toMatchObject({
			count: 82,
			nearestKm: 11,
			maxFrpMw: 73.12,
			latest: 1792497060,
			stale: false
		});
	});

	it('keeps of a grid the count, the highest power and the latest time of each cell', () => {
		const raw = fixture('fires-grid') as Record<string, any>;
		const tile = firesFromApi(raw, 'cells');
		expect(tile.features.features).toHaveLength(raw.features.length);
		const [first] = raw.features;
		expect(tile.features.features[0].properties).toEqual({
			n: first.properties.count,
			frp: first.properties.max_frp_mw,
			t: first.properties.latest_utc
		});
		expect(tile.attribution).toBe(raw.metadata.attribution);
		expect(tile.disclaimer).toBe(raw.metadata.disclaimer);
		expect(tile.windowHours).toBe(raw.metadata.window_hours);
	});

	it('keeps of a detection its time, power, confidence, satellite and day or night, to about 10 m', () => {
		const raw = fixture('fires') as Record<string, any>;
		const tile = firesFromApi(raw, 'dots');
		expect(tile.truncated).toBe(raw.metadata.truncated);
		const [first] = raw.features;
		const [kept] = tile.features.features;
		expect(kept.properties).toEqual({
			t: first.properties.acq_utc,
			frp: first.properties.frp_mw,
			c: first.properties.confidence,
			s: first.properties.satellite,
			d: first.properties.daynight
		});
		const [lon, lat] = (kept.geometry as { coordinates: number[] }).coordinates;
		expect(Math.abs(lon - first.geometry.coordinates[0])).toBeLessThanOrEqual(0.00005);
		expect(Math.abs(lat - first.geometry.coordinates[1])).toBeLessThanOrEqual(0.00005);
	});

	it('leaves out what the API did not give, and drops a feature without a position', () => {
		const tile = firesFromApi(
			{
				features: [
					{
						geometry: { type: 'Point', coordinates: [10, 20] },
						properties: { acq_utc: 5, frp_mw: null, confidence: 'odd' }
					},
					{ geometry: null, properties: { acq_utc: 6 } }
				]
			},
			'dots'
		);
		expect(tile.features.features).toHaveLength(1);
		expect(tile.features.features[0].properties).toEqual({ t: 5 });
		expect(tile.attribution).toBeNull();
		expect(
			firesFromApi({ features: [{ geometry: { coordinates: [1, 2] }, properties: { count: 0 } }] }, 'cells')
				.features.features
		).toHaveLength(0);
	});
});

describe('places near a hazard', () => {
	it('keeps the named places of a real answer, nearest first', () => {
		const raw = fixture('hazards') as Record<string, any>;
		const { items } = hazardsFromApi(raw);
		const near = raw.features.find((f: any) => f.properties.near_places?.length);
		expect(items.find((h) => h.id === near.id)?.nearPlaces).toEqual(
			near.properties.near_places.map((p: any) => ({ name: p.name, kind: p.kind, distanceKm: p.distance_km }))
		);
	});

	it('tells nothing near ([]) from not compared (null), and leaves out a place without a name', () => {
		const hazard = (nearPlaces: unknown) =>
			hazardsFromApi({
				features: [
					{
						type: 'Feature',
						id: 'q',
						geometry: { type: 'Point', coordinates: [-80.5, 7.3] },
						properties: { title: 'M 7.7', category: 'EARTHQUAKE', near_places: nearPlaces }
					}
				]
			}).items[0].nearPlaces;
		expect(hazard(undefined)).toBeNull();
		expect(hazard(null)).toBeNull();
		expect(hazard([])).toEqual([]);
		expect(
			hazard([
				{ name: 'Azuero Fault Zone', kind: 'fault', distance_km: 4.3, sources: ['GEM'] },
				{ name: null, kind: 'fault', distance_km: 6 }
			])
		).toEqual([{ name: 'Azuero Fault Zone', kind: 'fault', distanceKm: 4.3 }]);
	});
});
