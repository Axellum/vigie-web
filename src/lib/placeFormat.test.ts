import { describe, expect, it } from 'vitest';
import { placeFormat } from './placeFormat';

// Non-breaking spaces and the minus sign differ between ICU versions: compare with plain ones.
const plain = (s: string) => s.replace(/[  ]/g, ' ').replace(/−/g, '-');

describe('placeFormat', () => {
	it('writes a position with the decimal comma and the French "O" for the west, and the dot and "W" in English', () => {
		const fr = placeFormat('fr');
		const en = placeFormat('en');
		expect(plain(fr.where({ lat: 43.66, lon: -1.44 }))).toBe('43,66° N, 1,44° O');
		expect(plain(en.where({ lat: -23.55, lon: 46.63 }))).toBe('23.55° S, 46.63° E');
	});

	it('shows a missing figure as a dash, never a number', () => {
		const f = placeFormat('fr');
		expect(f.unit(null, '°C')).toBe('–');
		expect(f.unit(undefined, 'm')).toBe('–');
		expect(plain(f.unit(17.2, '°C'))).toBe('17,2 °C');
		expect(plain(f.unit(12.4, 'km/h', 0))).toBe('12 km/h');
	});

	it('writes the figures the way the site always did while nothing is chosen, and in the units chosen otherwise', () => {
		const same = placeFormat('fr');
		expect(plain(same.temp(17.2))).toBe('17,2 °C');
		expect(plain(same.wind(12.4))).toBe('12 km/h');
		expect(plain(same.length(1.84))).toBe('1,8 m');
		expect(same.temp(null)).toBe('–');
		expect(same.wind(undefined)).toBe('–');
		expect(same.length(null)).toBe('–');

		const chosen = placeFormat('fr', { temperature: 'f', wind: 'kn', height: 'ft' });
		expect(plain(chosen.temp(20))).toBe('68 °F');
		expect(plain(chosen.deg(20))).toBe('68');
		expect(plain(chosen.wind(18.52))).toBe('10 nœuds');
		expect(plain(chosen.length(1))).toBe('3,3 ft');
		expect(plain(chosen.signed(1))).toBe('+3,28 ft');
		const en = placeFormat('en', { temperature: 'c', wind: 'mph', height: 'm' });
		expect(plain(en.wind(16.09344))).toBe('10 mph');
	});

	it('signs a height, and gives kilometres a decimal below ten', () => {
		const f = placeFormat('fr');
		expect(plain(f.signed(1.234))).toBe('+1,23 m');
		expect(plain(f.signed(-0.5))).toBe('-0,5 m');
		expect(plain(f.signed(0))).toBe('0 m');
		expect(plain(f.km(4.26))).toBe('4,3');
		expect(plain(f.km(42.6))).toBe('43');
	});

	it('reads a calendar date as UTC, so that it never shifts a day', () => {
		const f = placeFormat('en');
		expect(plain(f.day('2026-11-08'))).toMatch(/^Sun,? 8$|^Sun 8$/);
	});
});
