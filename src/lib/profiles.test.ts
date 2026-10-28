import { describe, expect, it } from 'vitest';
import { asProfile, CARDS, cardOrder, PROFILES, wantsSea } from './profiles';

describe('profiles', () => {
	it('reads a known profile only', () => {
		expect(asProfile('surf')).toBe('surf');
		expect(asProfile('kite')).toBeNull();
		expect(asProfile(null)).toBeNull();
	});

	it('orders every card once, for every profile', () => {
		for (const profile of [null, ...PROFILES])
			for (const inForce of [false, true])
				expect([...cardOrder(profile, inForce)].sort()).toEqual([...CARDS].sort());
	});

	it('puts what the profile looks at first, and a warning in force before anything', () => {
		expect(cardOrder(null, false)[0]).toBe('official');
		expect(cardOrder('surf', false).slice(0, 3)).toEqual(['sea', 'tide', 'official']);
		expect(cardOrder('sky', false)[0]).toBe('sky');
		expect(cardOrder('allergy', false)[0]).toBe('air');
		expect(cardOrder('surf', true).slice(0, 2)).toEqual(['official', 'sea']);
		expect(cardOrder('garden', true).slice(0, 2)).toEqual(['official', 'weather']);
	});

	it('asks for the sea for the sea profiles only', () => {
		expect(PROFILES.filter(wantsSea)).toEqual(['surf', 'sea']);
		expect(wantsSea(null)).toBe(false);
	});
});
