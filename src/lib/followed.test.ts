import { describe, expect, it } from 'vitest';
import { follow, MAX_FOLLOWED, parseFollowed, sameSpot, unfollow, type FollowedPlace } from './followed';

const BIARRITZ: FollowedPlace = { lat: 43.483, lon: -1.559, radiusKm: 50, name: 'Biarritz', profile: 'surf' };
const CORTE: FollowedPlace = { lat: 42.306, lon: 9.15, radiusKm: 300, name: null, profile: null };

describe('followed places', () => {
	it('reads back what it wrote', () => {
		expect(parseFollowed(JSON.stringify([BIARRITZ, CORTE]))).toEqual([BIARRITZ, CORTE]);
	});

	it('drops what it cannot read, and the same spot twice', () => {
		expect(parseFollowed(null)).toEqual([]);
		expect(parseFollowed('not json')).toEqual([]);
		expect(parseFollowed('{"lat":1}')).toEqual([]);
		const raw = JSON.stringify([
			null,
			{ lat: 'x', lon: 1 },
			{ lat: 95, lon: 0 },
			{ lat: 43.48312, lon: -1.55921, radiusKm: 7, name: '  ', profile: 'kite' },
			{ ...BIARRITZ }
		]);
		expect(parseFollowed(raw)).toEqual([
			{ lat: 43.483, lon: -1.559, radiusKm: 300, name: null, profile: null }
		]);
	});

	it('keeps ten places at most, and short names', () => {
		const many = Array.from({ length: 12 }, (_, i) => ({ ...CORTE, lat: i, name: 'x'.repeat(100) }));
		const read = parseFollowed(JSON.stringify(many));
		expect(read).toHaveLength(MAX_FOLLOWED);
		expect(read[0].name).toHaveLength(80);
	});

	it('follows, updates and unfollows a spot to about 100 m', () => {
		expect(sameSpot(BIARRITZ, { lat: 43.4834, lon: -1.5586 })).toBe(true);
		expect(sameSpot(BIARRITZ, CORTE)).toBe(false);
		const list = follow([CORTE], BIARRITZ);
		expect(list).toEqual([CORTE, BIARRITZ]);
		expect(follow(list, { ...BIARRITZ, radiusKm: 25 })).toEqual([CORTE, { ...BIARRITZ, radiusKm: 25 }]);
		expect(unfollow(list, { lat: 42.306, lon: 9.15 })).toEqual([BIARRITZ]);
		const full = Array.from({ length: MAX_FOLLOWED }, (_, i) => ({ ...CORTE, lat: i }));
		expect(follow(full, BIARRITZ)).toBe(full);
	});
});
