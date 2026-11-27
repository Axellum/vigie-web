import { describe, expect, it } from 'vitest';
import type { SeaPin } from './map';
import { nearestPins, townOf } from './town';

describe('the town of a name of the base map', () => {
	const hossegor = {
		class: 'town',
		name: 'Soorts-Hossegor',
		'name:fr': 'Soorts-Hossegor',
		name_en: 'Soorts-Hossegor'
	};

	it('keeps the towns, cities and villages, with their point', () => {
		expect(townOf(hossegor, [-1.397, 43.665], 'fr')).toEqual({
			name: 'Soorts-Hossegor',
			lat: 43.665,
			lon: -1.397
		});
		expect(townOf({ ...hossegor, class: 'city' }, [-1.4, 43.6], 'fr')?.name).toBe('Soorts-Hossegor');
		expect(townOf({ ...hossegor, class: 'village' }, [-1.4, 43.6], 'fr')?.name).toBe('Soorts-Hossegor');
	});

	it('leaves the countries, regions, suburbs and hamlets', () => {
		for (const kind of ['country', 'state', 'suburb', 'hamlet', 'neighbourhood', undefined])
			expect(townOf({ ...hossegor, class: kind }, [-1.4, 43.6], 'fr')).toBeNull();
	});

	it('names it in the language of the page when the map has it, else as the map writes it', () => {
		const london = { class: 'city', name: 'London', 'name:fr': 'Londres', name_en: 'London' };
		expect(townOf(london, [-0.12, 51.5], 'fr')?.name).toBe('Londres');
		expect(townOf(london, [-0.12, 51.5], 'en')?.name).toBe('London');
		expect(townOf({ class: 'town', name: 'Capbreton' }, [-1.43, 43.64], 'en')?.name).toBe('Capbreton');
		expect(townOf({ class: 'town', name: 'Αθήνα', 'name:latin': 'Athína' }, [23.7, 37.9], 'fr')?.name).toBe(
			'Athína'
		);
	});

	it('gives nothing without a name or a point', () => {
		expect(townOf({ class: 'town' }, [-1.4, 43.6], 'fr')).toBeNull();
		expect(townOf({ class: 'town', name: '' }, [-1.4, 43.6], 'fr')).toBeNull();
		expect(townOf(hossegor, [Number.NaN, 43.6], 'fr')).toBeNull();
	});
});

describe('the spots nearest to a town', () => {
	const pin = (id: string, lat: number, lon: number): SeaPin => ({
		id,
		name: id,
		lat,
		lon,
		verdict: null,
		rank: 3,
		text: null,
		wind: null,
		windFrom: null,
		tide: null,
		label: id
	});
	// Hossegor's centre, then spots at about 1, 3, 9, 20 and 60 km.
	const town = { lat: 43.665, lon: -1.397 };
	const pins = [
		pin('far', 44.2, -1.3),
		pin('d20', 43.485, -1.397),
		pin('d1', 43.674, -1.397),
		pin('d9', 43.584, -1.397),
		pin('d3', 43.692, -1.397)
	];

	it('lists the nearest first, four at most, with their distance', () => {
		const near = nearestPins(pins, town);
		expect(near.map((n) => n.pin.id)).toEqual(['d1', 'd3', 'd9', 'd20']);
		expect(near[0].km).toBeCloseTo(1, 0);
		expect(near[3].km).toBeCloseTo(20, 0);
	});

	it('leaves the spots further than 30 km', () => {
		expect(nearestPins(pins, town, 10).map((n) => n.pin.id)).not.toContain('far');
		expect(nearestPins(pins, { lat: 48.85, lon: 2.35 })).toEqual([]);
	});
});
