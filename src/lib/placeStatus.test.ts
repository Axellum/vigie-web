import { describe, expect, it } from 'vitest';
import { placeLine, placeStatus } from './placeStatus';
import type { WarningsData, WarningSummary } from './types';

const NOW = Date.UTC(2026, 9, 29, 12) / 1000;
const place = { lat: 43.5, lon: -1.5 };

function warning(over: Partial<WarningSummary>): WarningSummary {
	return {
		id: 'w',
		apiId: null,
		cc: 'FR',
		source: 'meteoalarm',
		level: 'ORANGE',
		levelOriginal: null,
		phenomenon: 'wind',
		area: 'Pyrénées-Atlantiques',
		sent: null,
		onset: null,
		expires: NOW + 3 * 3600,
		ends: null,
		shape: 'pa',
		texts: [],
		...over
	};
}

function country(warnings: WarningSummary[]): WarningsData {
	return {
		cc: 'FR',
		generated: null,
		coverage: [],
		attributions: [],
		disclaimer: null,
		// A square around the place.
		shapes: {
			pa: {
				type: 'Polygon',
				coordinates: [
					[
						[-2, 43],
						[-1, 43],
						[-1, 44],
						[-2, 44],
						[-2, 43]
					]
				]
			}
		},
		warnings
	};
}

const ok = (warnings: WarningSummary[]) => [
	{ cc: 'FR', state: { status: 'ok' as const, data: country(warnings) } }
];

describe('a followed place on the home page', () => {
	it('says the highest level in force there, until when, and what', () => {
		const status = placeStatus(
			place,
			ok([warning({}), warning({ id: 'far', level: 'RED', shape: null })]),
			'FR',
			['FR']
		);
		expect(status).toMatchObject({ kind: 'here', level: 'ORANGE' });
		expect(placeLine('fr', status, NOW)).toMatch(/^Orange jusqu'à \d+ h · vent$/);
		// The issuer's words, when they name the level already, are said alone.
		const own = placeStatus(
			place,
			ok([
				warning({ texts: [{ language: 'fr-FR', headline: null, event: 'Vigilance orange vent violent' }] })
			]),
			'FR',
			['FR']
		);
		expect(placeLine('fr', own, NOW)).toMatch(/^Vigilance orange vent violent, jusqu/);
	});

	it('says when nothing is in force, when only the country is warned, and when no source covers it', () => {
		const none = placeStatus(place, ok([]), 'FR', ['FR']);
		expect(placeLine('fr', none, NOW)).toBe('Rien d’officiel en cours');
		const unplaced = placeStatus(place, ok([warning({ shape: null, level: 'YELLOW' })]), 'FR', ['FR']);
		expect(unplaced).toEqual({ kind: 'country', level: 'YELLOW', n: 1 });
		expect(placeLine('fr', unplaced, NOW)).toBe('Jaune dans le pays, sans zone');
		expect(placeStatus(place, [], 'FR', ['FR']).kind).toBe('nosource');
		expect(placeStatus(place, ok([]), 'MA', ['FR']).kind).toBe('nosource');
	});

	it('waits for the countries and the borders, and says when a source did not answer', () => {
		expect(placeStatus(place, [{ cc: 'FR', state: undefined }], 'FR', ['FR']).kind).toBe('loading');
		expect(placeStatus(place, ok([]), undefined, ['FR']).kind).toBe('loading');
		expect(placeStatus(place, [{ cc: 'FR', state: { status: 'error' } }], 'FR', ['FR']).kind).toBe('failed');
	});
});
