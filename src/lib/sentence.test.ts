import { describe, expect, it } from 'vitest';
import { fromDirection, placeSentence, untilPhrase, warningLabel, type SentenceInput } from './sentence';
import type { Hazard, Level, PointWeather, WarningSummary } from './types';

const TZ = 'Europe/Paris';
// Wednesday 28 October 2026, 19:00 in Paris (UTC+1).
const NOW = Date.UTC(2026, 9, 28, 18, 0) / 1000;
const at = (day: number, hourUtc: number) => Date.UTC(2026, 9, day, hourUtc, 0) / 1000;

function warning(
	level: Level | null,
	phenomenon: string | null,
	texts: WarningSummary['texts'] = [],
	ends?: number
) {
	return {
		id: `${level}-${phenomenon}`,
		cc: 'FR',
		source: 'meteofrance',
		level,
		levelOriginal: null,
		phenomenon,
		area: null,
		sent: null,
		onset: null,
		expires: null,
		ends: ends ?? null,
		shape: null,
		texts
	} satisfies WarningSummary;
}
const fr = (event: string) => ({ language: 'fr-FR', headline: null, event });

const weather = {
	current: { tempC: 12.8, feelsLikeC: 11, windKmh: 9.8, windDeg: 84, code: 3 },
	marine: { waveM: 2.62, wavePeriodS: 12.7, waveDeg: 309 },
	space: { kp: 1.3, storm: 'G0' },
	air: { eaqi: 22 }
} as unknown as PointWeather;

function input(over: Partial<SentenceInput>): SentenceInput {
	return {
		lang: 'fr',
		profile: null,
		official: 'none',
		warnings: [],
		hazards: [],
		weather: null,
		now: NOW,
		timeZone: TZ,
		...over
	};
}

describe('words of the sentence', () => {
	it('says where the wind or the waves come from', () => {
		expect(fromDirection('fr', 0)).toBe('du nord');
		expect(fromDirection('fr', 84)).toBe("d'est");
		expect(fromDirection('fr', 309)).toBe('de nord-ouest');
		expect(fromDirection('fr', 359)).toBe('du nord');
		expect(fromDirection('en', 180)).toBe('from the south');
		expect(fromDirection('fr', null)).toBeNull();
	});

	it("keeps the issuer's word in the reader's language, else the site's label", () => {
		expect(warningLabel(warning('YELLOW', 'snow-ice', [fr('Gel au sol')]), 'fr')).toBe('Gel au sol');
		expect(warningLabel(warning('YELLOW', 'snow-ice', [fr('Gel au sol')]), 'en')).toBe('snow, ice');
		expect(warningLabel(warning('YELLOW', null), 'fr')).toBeNull();
	});

	it("tells the end today, tomorrow or on a date, in the reader's time", () => {
		expect(untilPhrase('fr', at(28, 22), NOW, TZ)).toBe("jusqu'à 23 h");
		expect(untilPhrase('fr', at(28, 21) + 59 * 60, NOW, TZ)).toBe("jusqu'à 22 h 59");
		expect(untilPhrase('fr', at(29, 7), NOW, TZ)).toBe("jusqu'à demain 8 h");
		expect(untilPhrase('fr', at(30, 6), NOW, TZ)).toBe("jusqu'au ven. 30 oct., 7 h");
		expect(untilPhrase('en', at(29, 7), NOW, TZ)).toBe('until tomorrow 08:00');
	});
});

describe('the place in one sentence', () => {
	it('tells "no source" and "nothing here" apart', () => {
		expect(placeSentence(input({ official: 'nosource' }))).toEqual([
			'Pas de source officielle lue pour ce pays.'
		]);
		expect(placeSentence(input({ official: 'none' }))).toEqual(["Rien d'officiel ici."]);
		// While the warnings load, or when some have no area, nothing is said about them.
		expect(placeSentence(input({ official: 'loading' }))).toEqual([]);
		expect(placeSentence(input({ official: 'unplaced' }))).toEqual([]);
	});

	it("says the issuer's words alone when they name the level", () => {
		const red = warning('RED', 'rain', [fr('Vigilance rouge pluie-inondation')], at(28, 22));
		const yellow = warning('YELLOW', 'thunderstorm', [fr('Vigilance jaune orages')], at(29, 7));
		const said = placeSentence(input({ official: 'warnings', warnings: [yellow, red] }));
		expect(said).toEqual(["Vigilance rouge pluie-inondation, jusqu'à 23 h."]);
	});

	it("puts the level before a word that does not name it, and the site's labels in lower case", () => {
		const frost = warning('YELLOW', 'snow-ice', [fr('Gel au sol')], at(29, 7));
		expect(placeSentence(input({ official: 'warnings', warnings: [frost] }))).toEqual([
			"Vigilance jaune : Gel au sol, jusqu'à demain 8 h."
		]);
		const wind = warning('ORANGE', 'wind');
		expect(placeSentence(input({ official: 'warnings', warnings: [wind] }))).toEqual([
			'Vigilance orange : vent.'
		]);
		expect(placeSentence(input({ lang: 'en', official: 'warnings', warnings: [wind] }))).toEqual([
			'Orange warning: wind.'
		]);
	});

	it('names three kinds at most', () => {
		const many = ['wind', 'rain', 'heat', 'fog'].map((p) => warning('YELLOW', p));
		expect(placeSentence(input({ official: 'warnings', warnings: many }))).toEqual([
			'Vigilance jaune : vent, pluie, canicule (+1).'
		]);
	});

	it('names the most severe hazard around, then the nearest', () => {
		const quake = { category: 'EARTHQUAKE', level: 'ORANGE', value: 5.2 } as Hazard;
		const fire = { category: 'WILDFIRE', level: 'ORANGE', value: null } as Hazard;
		const storm = { category: 'HURRICANE', level: 'YELLOW', value: null } as Hazard;
		const said = placeSentence(
			input({
				hazards: [
					{ hazard: storm, distanceKm: 3 },
					{ hazard: fire, distanceKm: 80 },
					{ hazard: quake, distanceKm: 42.4 }
				]
			})
		);
		expect(said).toEqual(["Rien d'officiel ici.", 'Séisme M 5,2 à 42 km.']);
	});

	it('adds what the profile looks at, after the weather', () => {
		expect(placeSentence(input({ weather }))).toEqual([
			"Rien d'officiel ici.",
			'Vagues de 2,6 m, 13 s, de nord-ouest.',
			'Couvert, 13 °C.'
		]);
		expect(placeSentence(input({ profile: 'surf', weather }))).toEqual([
			"Rien d'officiel ici.",
			'Vagues de 2,6 m, 13 s, de nord-ouest.',
			'Couvert, 13 °C.',
			"Vent 10 km/h d'est."
		]);
		expect(placeSentence(input({ profile: 'sky', weather: { ...weather, marine: null } }))).toEqual([
			"Rien d'officiel ici.",
			'Activité géomagnétique : indice Kp 1,3 (G0).',
			'Couvert, 13 °C.'
		]);
		expect(
			placeSentence(input({ lang: 'en', profile: 'allergy', weather: { ...weather, marine: null } }))
		).toEqual(['No official warning here.', 'Air quality: European index 22.', 'Overcast, 13 °C.']);
	});
});
