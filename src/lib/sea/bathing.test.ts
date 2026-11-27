import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TideExtreme } from '../tides';
import { BATHING_NEAR_KM, baineWindow, bearingDeg, nearestBathing, onBaineCoast } from './bathing';
import { placeListFromApi } from './places';

const fixture = (name: string) =>
	JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', name), 'utf-8'));
// The places around Saint-Malo: ports, slipways and bathing sites, each with its class.
const places = placeListFromApi(fixture('sea-places-near.json'))!.places;
const bathing = places.filter((p) => p.type === 'bathing');

describe('the bathing site of a spot', () => {
	it('is the nearest monitored bathing site, never another kind of place', () => {
		const corbieres = bathing.find((p) => p.name === 'Les Corbieres')!;
		const near = nearestBathing(places, { lat: corbieres.lat + 0.001, lon: corbieres.lon })!;
		expect(near.place.id).toBe(corbieres.id);
		expect(near.km).toBeCloseTo(0.111, 2);
		// A port a few metres away does not count.
		const port = places.find((p) => p.type !== 'bathing')!;
		const fromPort = nearestBathing(places, port)!;
		expect(fromPort.place.type).toBe('bathing');
	});

	it('is a beach of the shore, not a lake behind it', () => {
		// Hossegor, Plage Sud (facing 282°): the sites of the beaches north and south, the lake a kilometre inland.
		const hossegor = { lat: 43.6601, lon: -1.4448 };
		const around = placeListFromApi(fixture('sea-places-near-bathing.json'))!.places;
		const near = nearestBathing(around, hossegor, 282)!;
		expect(near.place.name).toBe('Notre Dame');
		expect(near.km).toBeCloseTo(0.4, 1);
		// A pond 500 m straight inland is left out; the same pond counts when the facing is unknown.
		const pond = {
			...around[0],
			id: 'bathing-pond',
			name: 'Étang',
			lat: hossegor.lat,
			lon: hossegor.lon + 0.0062
		};
		expect(nearestBathing([pond], hossegor, 282)).toBeNull();
		expect(nearestBathing([pond], hossegor)!.place.id).toBe('bathing-pond');
		// Along the shore, it counts.
		expect(
			nearestBathing([{ ...pond, lat: hossegor.lat - 0.0045, lon: hossegor.lon }], hossegor, 282)
		).not.toBeNull();
		expect(bearingDeg(hossegor, { lat: hossegor.lat, lon: hossegor.lon + 0.01 })).toBeCloseTo(90, 0);
	});

	it('is the spot’s own only within the distance, measured from the spot', () => {
		const site = bathing[0];
		// About 1.1 km north: another beach.
		expect(nearestBathing([site], { lat: site.lat + 0.01, lon: site.lon })).toBeNull();
		expect(nearestBathing([site], { lat: site.lat + 0.008, lon: site.lon })!.km).toBeLessThan(
			BATHING_NEAR_KM
		);
		expect(nearestBathing([], site)).toBeNull();
	});
});

describe('the coast where the card speaks of baïnes', () => {
	it('is the open Atlantic from Charente-Maritime to the Basque Country, not on rock', () => {
		// Hossegor, Lacanau, Oléron (west coast), Anglet.
		expect(onBaineCoast({ lat: 43.66, lon: -1.44, facing: 282, bottom: 'sand' })).toBe(true);
		expect(onBaineCoast({ lat: 45.0, lon: -1.2, facing: 270, bottom: null })).toBe(true);
		expect(onBaineCoast({ lat: 45.9, lon: -1.37, facing: 250 })).toBe(true);
		expect(onBaineCoast({ lat: 43.5, lon: -1.54, facing: 300 })).toBe(true);
	});

	it('leaves out the other coasts, the beaches turned away from the ocean and the reefs', () => {
		// Brittany, the Channel, the Mediterranean, Vendée.
		expect(onBaineCoast({ lat: 47.5, lon: -3.1, facing: 200 })).toBe(false);
		expect(onBaineCoast({ lat: 49.5, lon: 0.1, facing: 300 })).toBe(false);
		expect(onBaineCoast({ lat: 43.3, lon: 5.3, facing: 200 })).toBe(false);
		expect(onBaineCoast({ lat: 46.7, lon: -1.9, facing: 250 })).toBe(false);
		// Inside the bay of Arcachon (facing north), without a known facing, on rock.
		expect(onBaineCoast({ lat: 44.66, lon: -1.17, facing: 10 })).toBe(false);
		expect(onBaineCoast({ lat: 44.66, lon: -1.25, facing: null })).toBe(false);
		expect(onBaineCoast({ lat: 43.42, lon: -1.6, facing: 300, bottom: 'rock' })).toBe(false);
	});
});

describe('the window of the baïnes', () => {
	const H = 3600;
	const ext = (t: number, kind: 'low' | 'high'): TideExtreme => ({
		t,
		kind,
		h: kind === 'low' ? -1.5 : 1.5,
		range: null
	});
	const curve = [
		ext(0, 'high'),
		ext(6 * H, 'low'),
		ext(12 * H, 'high'),
		ext(18.5 * H, 'low'),
		ext(24.5 * H, 'high')
	];

	it('goes from three hours before to three hours after the next low water', () => {
		expect(baineWindow(curve, 1 * H)).toEqual({ low: curve[1], from: 3 * H, to: 9 * H, now: false });
	});

	it('is the one under way while it lasts, then the next one', () => {
		expect(baineWindow(curve, 4 * H)).toMatchObject({ from: 3 * H, now: true });
		expect(baineWindow(curve, 9 * H)).toMatchObject({ low: curve[3], from: 15.5 * H, now: false });
	});

	it('is left out without a low water ahead, or when the next one is far', () => {
		expect(baineWindow(curve, 22 * H)).toBeNull();
		expect(baineWindow([ext(0, 'high')], 0)).toBeNull();
		expect(baineWindow(curve, -30 * H)).toBeNull();
	});
});
