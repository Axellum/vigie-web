import { describe, expect, it } from 'vitest';
import { PLACE_TYPES, QUALITIES, USES } from './places';
import { dateLabel, licenceText, PLACES_TEXT, placesText, placeTitle, placeWhere } from './places-text';

describe('the words of the pages of the places', () => {
	it('has every text in both languages, with the same placeholders', () => {
		expect(Object.keys(PLACES_TEXT.en).sort()).toEqual(Object.keys(PLACES_TEXT.fr).sort());
		const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(PLACES_TEXT.fr) as (keyof typeof PLACES_TEXT.fr)[])
			expect(holes(PLACES_TEXT.en[key]), key).toEqual(holes(PLACES_TEXT.fr[key]));
	});

	it('names every kind, class and use the API can give, in both languages', () => {
		for (const lang of ['fr', 'en'] as const) {
			for (const type of PLACE_TYPES) {
				expect(placesText(lang, `type.${type}`)).not.toBe(`type.${type}`);
				expect(placesText(lang, `types.${type}`)).not.toBe(`types.${type}`);
				expect(placesText(lang, `about.${type}`)).not.toBe(`about.${type}`);
				expect(placesText(lang, `metaPlace.${type}`, { title: 'X' })).toContain('X');
			}
			for (const q of QUALITIES) expect(placesText(lang, `quality.${q}`)).not.toBe(`quality.${q}`);
			for (const use of USES) expect(placesText(lang, `use.${use}`)).not.toBe(`use.${use}`);
		}
	});

	it('says that a catalogue is not a forecast, in the safety line and in the descriptions', () => {
		expect(PLACES_TEXT.fr.safety).toContain('pas une prévision');
		expect(PLACES_TEXT.en.safety).toContain('not a forecast');
		for (const type of PLACE_TYPES) {
			expect(PLACES_TEXT.fr[`metaPlace.${type}`]).toMatch(/pas une prévision|pas l’eau d’aujourd’hui/);
			expect(PLACES_TEXT.en[`metaPlace.${type}`]).toMatch(/not a forecast|not the water of today/);
		}
	});

	it('keeps the water class a context: the class of the seasons, never the water of today', () => {
		expect(PLACES_TEXT.fr.qualityNote).toContain('pas l’état de l’eau aujourd’hui');
		expect(PLACES_TEXT.en.qualityNote).toContain('not the state of the water today');
		expect(PLACES_TEXT.fr.quality).toContain('2021 à 2024');
	});

	it('fills the placeholders, and falls back to French, then to the key', () => {
		expect(placesText('en', 'around', { place: 'Brest' })).toBe('Around Brest');
		expect(placesText('fr', 'around', { place: 'Brest' })).toBe('Autour de Brest');
		expect(placesText('en', 'no.such.key')).toBe('no.such.key');
	});
});

describe('the title of a place', () => {
	const base = { near: null, lat: 48.6429, lon: -2.0236 };

	it('is its own name when it has one', () => {
		expect(placeTitle('fr', { ...base, type: 'port', name: 'Port de Saint-Malo', near: 'Bas-Sablons' })).toBe(
			'Port de Saint-Malo'
		);
	});

	it('is its kind and the nearest locality when it has no name', () => {
		expect(placeTitle('fr', { ...base, type: 'slipway', name: null, near: 'Saint-Malo' })).toBe(
			'Cale de mise à l’eau près de Saint-Malo'
		);
		expect(placeTitle('en', { ...base, type: 'anchorage', name: null, near: 'Brest' })).toBe(
			'Anchorage near Brest'
		);
	});

	it('is its kind and its position when it has neither', () => {
		expect(placeTitle('fr', { ...base, type: 'slipway', name: null })).toBe(
			'Cale de mise à l’eau (48.643, -2.024)'
		);
	});

	it('says where it is: the commune, then the locality when it adds something', () => {
		expect(placeWhere({ name: 'L’Éventail', near: 'Saint-Malo', commune: 'Saint-Malo' })).toBe('Saint-Malo');
		expect(placeWhere({ name: 'Port', near: 'Bas-Sablons', commune: 'Saint-Malo' })).toBe(
			'Saint-Malo · Bas-Sablons'
		);
		expect(placeWhere({ name: 'Port', near: 'Bas-Sablons', commune: null })).toBe('Bas-Sablons');
		expect(placeWhere({ name: null, near: 'Saint-Malo', commune: null })).toBeNull();
	});
});

describe('the licence line of the API', () => {
	const api = 'ODbL-1.0 (OpenStreetMap), Licence Ouverte (Sandre), Licence Ouverte 2.0 (bathing quality)';

	it('keeps the names of the licences and says in French what the known ones cover', () => {
		expect(licenceText('fr', api)).toBe(
			'ODbL-1.0 (OpenStreetMap), Licence Ouverte (Sandre), Licence Ouverte 2.0 (qualité des baignades)'
		);
	});

	it('is the API’s own line in English', () => {
		expect(licenceText('en', api)).toBe(api);
	});

	it('leaves as it is what it does not know: a new source, an empty line, a line with no brackets', () => {
		expect(licenceText('fr', 'CC BY 4.0 (tide model)')).toBe('CC BY 4.0 (tide model)');
		expect(licenceText('fr', '')).toBe('');
		expect(licenceText('fr', 'ODbL-1.0')).toBe('ODbL-1.0');
	});
});

describe('the date of the catalogue', () => {
	it('is written in words, in Paris', () => {
		const built = Date.parse('2026-11-08T11:17:21Z') / 1000;
		expect(dateLabel('fr', built)).toBe('8 novembre 2026');
		expect(dateLabel('en', built)).toBe('8 November 2026');
	});
});
