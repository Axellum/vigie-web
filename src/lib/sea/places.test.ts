import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SeaRow } from './overview';
import {
	collectNamedIds,
	groupByType,
	isPlaceId,
	osmLink,
	PLACE_KM,
	placeAnswerFromApi,
	placeFromApi,
	placeListFromApi,
	placesQueryString,
	spotsAround,
	type PlaceType,
	type SeaPlace,
	type SeaPlaceList
} from './places';

const fixture = (name: string): unknown =>
	JSON.parse(
		readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', `${name}.json`), 'utf-8')
	);

const place = (over: Partial<SeaPlace> & { id: string; type: PlaceType }): SeaPlace => ({
	name: 'A name',
	near: null,
	commune: null,
	lat: 48,
	lon: -2,
	distanceKm: null,
	uses: null,
	quality: null,
	...over
});

describe('reading the catalogue of the coast', () => {
	it('reads the places around Saint-Malo, nearest first, with the count of each kind', () => {
		const list = placeListFromApi(fixture('sea-places-near'))!;
		expect(list.places.length).toBe(list.returned);
		expect(list.count).toBeGreaterThanOrEqual(list.returned);
		expect(Object.keys(list.byType).sort()).toEqual(['anchorage', 'bathing', 'dive', 'port', 'slipway']);
		const km = list.places.map((p) => p.distanceKm ?? NaN);
		expect(km.every(Number.isFinite)).toBe(true);
		expect([...km].sort((a, b) => a - b)).toEqual(km);
		expect(list.built).toBe(Date.parse('2026-11-08T11:17:21Z') / 1000);
		expect(list.attribution).toContain('OpenStreetMap');
		expect(list.note).toContain('not a forecast');
	});

	it('reads a port with what it is used for, and a bathing site with the class of its water', () => {
		const port = placeAnswerFromApi(fixture('sea-place-port'))!;
		expect(port.place.type).toBe('port');
		expect(port.place.name).toBe('Port de Saint-Malo');
		expect(port.place.uses).toEqual(['fishing', 'leisure', 'passengers', 'trade']);
		expect(port.place.quality).toBeNull();
		const bathing = placeAnswerFromApi(fixture('sea-place-bathing'))!;
		expect(bathing.place.type).toBe('bathing');
		expect(bathing.place.quality).toBe('poor');
		expect(bathing.place.uses).toBeNull();
	});

	it('keeps a slipway without a name as it is: no name, the nearest locality', () => {
		const slipway = placeAnswerFromApi(fixture('sea-place-slipway'))!.place;
		expect(slipway.name).toBeNull();
		expect(slipway.near).toBe('Saint-Malo');
	});

	it('leaves out what it does not understand rather than guessing', () => {
		expect(placeFromApi({ id: 'port-x-1234', type: 'port', lat: 'north', lon: 1 })).toBeNull();
		expect(placeFromApi({ id: 'x-1234', type: 'volcano', lat: 1, lon: 1 })).toBeNull();
		expect(placeFromApi(null)).toBeNull();
		const odd = placeFromApi({
			id: 'bathing-x-1234',
			type: 'bathing',
			lat: 1,
			lon: 2,
			quality: 'splendid',
			uses: ['leisure', 'spaceport'],
			name: '  '
		})!;
		expect(odd.quality).toBeNull();
		expect(odd.uses).toEqual(['leisure']);
		expect(odd.name).toBeNull();
		expect(placeListFromApi({ places: 'none' })).toBeNull();
		expect(placeListFromApi({ places: [{ nonsense: true }] })!.places).toEqual([]);
		expect(placeAnswerFromApi({ place: {} })).toBeNull();
	});
});

describe('the address of a place', () => {
	it('accepts the ids of the API and nothing else', () => {
		for (const id of [
			'port-port-de-saint-malo-f697',
			'slipway-saint-malo-eb59',
			'dive-pytheas-ffa1',
			'slipway-eb59'
		])
			expect(isPlaceId(id), id).toBe(true);
		for (const id of [
			'',
			'port',
			'volcano-x-f697',
			'port-X-f697',
			'port-x-F697',
			'port-x-f69',
			'port-x-f6977',
			'port-../etc-f697',
			'port-x y-f697',
			`port-${'a'.repeat(130)}-f697`
		])
			expect(isPlaceId(id), id).toBe(false);
	});
});

describe('what is asked of the API', () => {
	it('writes the same query for the same question, kinds sorted, once each', () => {
		expect(placesQueryString({ types: ['slipway', 'bathing', 'slipway'], limit: 13 })).toBe(
			'type=bathing&type=slipway&limit=13'
		);
		expect(placesQueryString({})).toBe('limit=50');
	});

	it('rounds a position to a kilometre and brings the radius within the limits of the API', () => {
		expect(placesQueryString({ near: { lat: 48.6429, lon: -2.0235, radiusKm: 25.4 } })).toBe(
			'near_lat=48.64&near_lon=-2.02&radius_km=25&limit=50'
		);
		expect(placesQueryString({ near: { lat: 0.001, lon: -0.004, radiusKm: 9999 } })).toBe(
			'near_lat=0.00&near_lon=0.00&radius_km=200&limit=50'
		);
		expect(placesQueryString({ near: { lat: 1, lon: 1, radiusKm: 0 } })).toContain('radius_km=1');
		expect(placesQueryString({ near: { lat: Number.NaN, lon: 1, radiusKm: 5 } })).toBe('limit=50');
	});

	it('cleans the words, cuts them at 80 characters and keeps the page within the limits', () => {
		expect(placesQueryString({ q: '  saint   malo ' })).toBe('q=saint%20malo&limit=50');
		expect(placesQueryString({ q: '   ' })).toBe('limit=50');
		expect(placesQueryString({ q: 'a'.repeat(200) })).toBe(`q=${'a'.repeat(80)}&limit=50`);
		expect(placesQueryString({ limit: 100_000, offset: -5 })).toBe('limit=500');
		expect(placesQueryString({ limit: 0, offset: 24.4 })).toBe('limit=1&offset=24');
	});
});

describe('the pages worth a search result', () => {
	const page = (type: PlaceType, offset: number, names: (string | null)[], count: number): SeaPlaceList => ({
		count,
		returned: names.length,
		limit: 500,
		offset,
		byType: { port: 0, slipway: 0, anchorage: 0, dive: 0, bathing: 0 },
		places: names.map((name, i) => place({ id: `${type}-${offset + i}-abcd`, type, name })),
		built: null,
		note: null,
		licence: null,
		attribution: null
	});

	it('reads every kind page by page, and keeps only the places that have a name', async () => {
		const asked: string[] = [];
		const ids = await collectNamedIds(async (type, offset) => {
			asked.push(`${type}@${offset}`);
			if (type === 'port') return page(type, offset, offset === 0 ? ['A', null, 'C'] : ['D'], 4);
			if (type === 'dive') return page(type, offset, [], 0);
			return page(type, offset, ['X'], 1);
		});
		expect(asked).toEqual(['port@0', 'port@3', 'slipway@0', 'anchorage@0', 'dive@0', 'bathing@0']);
		expect(ids).toEqual([
			'port-0-abcd',
			'port-2-abcd',
			'port-3-abcd',
			'slipway-0-abcd',
			'anchorage-0-abcd',
			'bathing-0-abcd'
		]);
	});

	it('stops on an empty page even when the count says there is more, and gives nothing if a page fails', async () => {
		const asked: number[] = [];
		await collectNamedIds(async (type, offset) => {
			if (type === 'port') asked.push(offset);
			return page(type, offset, [], 99);
		});
		expect(asked).toEqual([0]);
		await expect(
			collectNamedIds(async (type) => {
				if (type === 'anchorage') throw new Error('the API is down');
				return page(type, 0, ['X'], 1);
			})
		).rejects.toThrow('the API is down');
	});
});

describe('the places around a place', () => {
	it('groups by kind in a fixed order, caps each group, counts the rest and leaves the place itself out', () => {
		const places = [
			place({ id: 'bathing-a-0001', type: 'bathing' }),
			place({ id: 'port-a-0002', type: 'port' }),
			place({ id: 'bathing-b-0003', type: 'bathing' }),
			place({ id: 'bathing-c-0004', type: 'bathing' }),
			place({ id: 'slipway-a-0005', type: 'slipway' })
		];
		const groups = groupByType(places, 2, 'bathing-b-0003');
		expect(groups.map((g) => g.type)).toEqual(['port', 'slipway', 'bathing']);
		expect(groups[2].places.map((p) => p.id)).toEqual(['bathing-a-0001', 'bathing-c-0004']);
		expect(groups[2].more).toBe(0);
		const capped = groupByType(places, 1, null);
		expect(capped[2].places.map((p) => p.id)).toEqual(['bathing-a-0001']);
		expect(capped[2].more).toBe(2);
		expect(groupByType([], 3)).toEqual([]);
	});

	const row = (name: string, km: number | null): SeaRow => ({
		spot: { id: name, name, place: null, lat: 0, lon: 0, activities: [], warnings: 'ok', coastalLevel: null },
		activity: { id: 'surf', available: true, verdict: 'good', reason: null, slot: null, now: null },
		km
	});

	it('keeps the spots within the distance, and names the nearest of all', () => {
		const rows = [row('near', 12), row('edge', PLACE_KM), row('far', PLACE_KM + 0.1), row('unknown', null)];
		const { within, nearest } = spotsAround(rows);
		expect(within.map((r) => r.spot.id)).toEqual(['near', 'edge']);
		expect(nearest?.spot.id).toBe('near');
		expect(spotsAround([row('far', 300)]).within).toEqual([]);
		expect(spotsAround([row('far', 300)]).nearest?.spot.id).toBe('far');
		expect(spotsAround([]).nearest).toBeNull();
	});
});

describe('the link to the map', () => {
	it('points at the position on OpenStreetMap, to five decimals', () => {
		expect(osmLink({ lat: 48.6429, lon: -2.0235 })).toBe(
			'https://www.openstreetmap.org/?mlat=48.64290&mlon=-2.02350#map=16/48.64290/-2.02350'
		);
	});
});
