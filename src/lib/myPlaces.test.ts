import { describe, expect, it } from 'vitest';
import { parseSavedPlace, roundCoordinate } from './myPlaces';
import { parsePrefs } from './prefs';

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.append(k, v);
	return data;
}
const base = { name: 'Plage du Cap', lat: '43.66612', lon: '-1.44478', radiusKm: '10', profile: 'surf' };

describe('parseSavedPlace', () => {
	it('rounds a place to about 100 m', () => {
		const r = parseSavedPlace(form(base), 'place');
		expect(r).toEqual({
			ok: true,
			place: { name: 'Plage du Cap', lat: 43.666, lon: -1.445, radiusKm: 10, profile: 'surf' }
		});
	});

	it('rounds a home to about 1 km, so that the street is never stored', () => {
		const r = parseSavedPlace(form({ ...base, name: 'Maison' }), 'home');
		expect(r).toEqual({
			ok: true,
			place: { name: 'Maison', lat: 43.67, lon: -1.44, radiusKm: 10, profile: 'surf' }
		});
		expect(roundCoordinate(-0.004, 'home')).toBe(0);
		expect(Object.is(roundCoordinate(-0.004, 'home'), -0)).toBe(false);
	});

	it('takes the default radius when none is given, and refuses one the site does not offer', () => {
		const none = parseSavedPlace(form({ name: 'A', lat: '1', lon: '2' }), 'place');
		expect(none.ok && none.place.radiusKm).toBe(25);
		expect(parseSavedPlace(form({ ...base, radiusKm: '7' }), 'place')).toEqual({ ok: false, error: 'shape' });
		expect(parseSavedPlace(form({ ...base, radiusKm: 'x' }), 'place')).toEqual({ ok: false, error: 'shape' });
	});

	it('refuses a point off the planet, an empty or a missing coordinate, and a name that is empty', () => {
		expect(parseSavedPlace(form({ ...base, lat: '91' }), 'place')).toEqual({ ok: false, error: 'shape' });
		expect(parseSavedPlace(form({ ...base, lon: '-181' }), 'place')).toEqual({ ok: false, error: 'shape' });
		expect(parseSavedPlace(form({ ...base, lat: '' }), 'place')).toEqual({ ok: false, error: 'shape' });
		expect(parseSavedPlace(form({ ...base, lon: 'NaN' }), 'place')).toEqual({ ok: false, error: 'shape' });
		expect(parseSavedPlace(form({ ...base, name: '  ' }), 'place')).toEqual({ ok: false, error: 'name' });
	});

	it('takes an unknown profile for no profile, never for a refused place', () => {
		const r = parseSavedPlace(form({ ...base, profile: 'astrology' }), 'place');
		expect(r.ok && r.place.profile).toBeNull();
	});
});

describe('parsePrefs', () => {
	it('keeps the units the site offers and drops the rest', () => {
		expect(
			parsePrefs({ units: { temperature: 'f', wind: 'kn', height: 'ft', other: 1 }, theme: 'x' })
		).toEqual({
			units: { temperature: 'f', wind: 'kn', height: 'ft' }
		});
		expect(parsePrefs({ units: { temperature: 'kelvin', wind: 7 } })).toEqual({ units: {} });
	});

	it('reads anything that is not an object as no preference', () => {
		for (const v of [null, undefined, 'x', 3, [], { units: null }, { units: 'c' }])
			expect(parsePrefs(v)).toEqual({ units: {} });
	});
});
