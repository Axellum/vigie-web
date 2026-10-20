import { describe, expect, it } from 'vitest';
import { compass, skyLabel } from './weather';

describe('weather labels', () => {
	it('names the WMO codes in both languages and shows an unknown code as it is', () => {
		expect(skyLabel('fr', 3)).toBe('Couvert');
		expect(skyLabel('en', 95)).toBe('Thunderstorm');
		expect(skyLabel('fr', 42)).toBe('WMO 42');
		expect(skyLabel('en', null)).toBe('–');
	});

	it('turns degrees into the 8 points of the compass', () => {
		expect(compass('en', 0)).toBe('N');
		expect(compass('en', 223)).toBe('SW');
		expect(compass('fr', 223)).toBe('SO');
		expect(compass('fr', 359)).toBe('N');
		expect(compass('fr', -90)).toBe('O');
		expect(compass('en', null)).toBe('–');
	});
});
