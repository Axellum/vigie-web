import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import type { Level, WarningsData, WarningSummary } from './types';
import { byKey, featureChanges, zoneFeatures } from './zoneFeatures';

const square = (x: number): Polygon => ({
	type: 'Polygon',
	coordinates: [
		[
			[x, 0],
			[x + 1, 0],
			[x + 1, 1],
			[x, 1],
			[x, 0]
		]
	]
});

const warning = (id: string, shape: string | null, level: Level | null) =>
	({ id, shape, level }) as WarningSummary;

const country = (warnings: WarningSummary[], shapes: Record<string, Polygon>) =>
	({ cc: 'FR', shapes, warnings }) as unknown as WarningsData;

const all = () => true;

describe('zoneFeatures', () => {
	it('gives one feature per zone, with its highest level and its number of warnings', () => {
		const data = country(
			[
				warning('1', 'a', 'YELLOW'),
				warning('2', 'a', 'ORANGE'),
				warning('3', 'b', null),
				warning('4', null, 'RED'),
				warning('5', 'gone', 'RED')
			],
			{ a: square(0), b: square(2) }
		);
		expect(zoneFeatures('FR', data, all).map((f) => f.properties)).toEqual([
			{ key: 'FR|a', level: 'ORANGE', n: 2 },
			{ key: 'FR|b', level: 'NONE', n: 1 }
		]);
	});

	it('leaves out the levels that are not shown', () => {
		const data = country([warning('1', 'a', 'YELLOW'), warning('2', 'a', 'ORANGE')], { a: square(0) });
		const features = zoneFeatures('FR', data, (level) => level !== 'ORANGE');
		expect(features.map((f) => f.properties)).toEqual([{ key: 'FR|a', level: 'YELLOW', n: 1 }]);
	});

	it('keeps the object of a zone that did not change when the country is read again', () => {
		const first = zoneFeatures(
			'FR',
			country([warning('1', 'a', 'YELLOW'), warning('2', 'b', 'ORANGE'), warning('3', 'c', 'RED')], {
				a: square(0),
				b: square(2),
				c: square(4)
			}),
			all
		);
		// Read again: every object is new, `a` is as it was, `b` changed level, `c` changed shape, `d` is new.
		const second = zoneFeatures(
			'FR',
			country(
				[
					warning('1', 'a', 'YELLOW'),
					warning('2', 'b', 'RED'),
					warning('3', 'c', 'RED'),
					warning('4', 'd', 'YELLOW')
				],
				{ a: square(0), b: square(2), c: square(5), d: square(8) }
			),
			all,
			first
		);
		expect(second[0]).toBe(first[0]);
		expect(second[1]).not.toBe(first[1]);
		expect(second[1].properties).toEqual({ key: 'FR|b', level: 'RED', n: 1 });
		expect(second[2]).not.toBe(first[2]);
		expect(second[2].geometry).toEqual(square(5));
		expect(second).toHaveLength(4);
	});

	it('counts a second warning on a zone as a change', () => {
		const first = zoneFeatures('FR', country([warning('1', 'a', 'RED')], { a: square(0) }), all);
		const second = zoneFeatures(
			'FR',
			country([warning('1', 'a', 'RED'), warning('2', 'a', 'YELLOW')], { a: square(0) }),
			all,
			first
		);
		expect(second[0]).not.toBe(first[0]);
		expect(second[0].properties).toEqual({ key: 'FR|a', level: 'RED', n: 2 });
	});
});

describe('what changed between two lists', () => {
	const feature = (key: unknown): Feature => ({ type: 'Feature', geometry: square(0), properties: { key } });

	it('tells apart the new, the replaced, the gone and the kept', () => {
		const [a, b, c] = [feature('a'), feature('b'), feature('c')];
		const b2 = feature('b');
		const d = feature('d');
		const changes = featureChanges(byKey([a, b, c])!, byKey([a, b2, d])!);
		expect(changes.add).toEqual([b2, d]);
		expect(changes.add[0]).toBe(b2);
		expect(changes.remove).toEqual(['c']);
		expect(changes.kept).toBe(1);
	});

	it('finds nothing to say when the lists hold the same objects', () => {
		const list = [feature('a'), feature('b')];
		expect(featureChanges(byKey(list)!, byKey([...list].reverse())!)).toEqual({
			add: [],
			remove: [],
			kept: 2
		});
	});

	it('refuses a list with a missing or a shared key', () => {
		expect(byKey([feature('a'), feature(undefined)])).toBeNull();
		expect(byKey([feature('a'), feature('a')])).toBeNull();
		expect(byKey([feature('a'), feature(3)])).toBeNull();
		expect(byKey([])?.size).toBe(0);
	});
});
