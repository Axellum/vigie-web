import { describe, expect, it } from 'vitest';
import { parsePrefs } from './prefs';
import {
	DEFAULT_UNITS,
	height,
	heightLabel,
	isDefault,
	speed,
	speedLabel,
	temperature,
	temperatureLabel,
	unitsOf
} from './units';

describe('the units of a person', () => {
	it('are the default ones where nothing was chosen, and only the chosen ones where something was', () => {
		expect(unitsOf(null)).toEqual(DEFAULT_UNITS);
		expect(unitsOf(parsePrefs({}))).toEqual(DEFAULT_UNITS);
		expect(unitsOf(parsePrefs({ units: { wind: 'kn', height: 'ft', temperature: 'nope' } }))).toEqual({
			temperature: 'c',
			wind: 'kn',
			height: 'ft'
		});
		expect(isDefault(DEFAULT_UNITS)).toBe(true);
		expect(isDefault({ ...DEFAULT_UNITS, wind: 'ms' })).toBe(false);
	});
});

describe('the conversions', () => {
	it('turn °C into °F, with the two fixed points of the scale', () => {
		expect(temperature(0, 'f')).toBe(32);
		expect(temperature(100, 'f')).toBe(212);
		expect(temperature(-40, 'f')).toBe(-40);
		expect(temperature(21.5, 'c')).toBe(21.5);
	});

	it('turn km/h into m/s, knots and mph from their definitions', () => {
		expect(speed(36, 'kmh')).toBe(36);
		expect(speed(36, 'ms')).toBe(10);
		expect(speed(1.852, 'kn')).toBeCloseTo(1, 12);
		expect(speed(1.609344, 'mph')).toBeCloseTo(1, 12);
		expect(speed(0, 'kn')).toBe(0);
	});

	it('turn metres into feet', () => {
		expect(height(0.3048, 'ft')).toBeCloseTo(1, 12);
		expect(height(2, 'm')).toBe(2);
		expect(height(1, 'ft')).toBeCloseTo(3.28084, 5);
	});
});

describe('the labels', () => {
	it('say the unit as it is written after a figure, in the language of the reader', () => {
		expect(temperatureLabel('c')).toBe('°C');
		expect(temperatureLabel('f')).toBe('°F');
		expect(heightLabel('ft')).toBe('ft');
		expect(speedLabel('fr', 'kn')).toBe('nœuds');
		expect(speedLabel('en', 'kn')).toBe('kn');
		expect(speedLabel('fr', 'kmh')).toBe('km/h');
		expect(speedLabel('en', 'ms')).toBe('m/s');
		expect(speedLabel('en', 'mph')).toBe('mph');
	});
});
