import { describe, expect, it } from 'vitest';
import type { WarningHere } from '../near';
import type { WarningSummary } from '../types';
import { cardData, cardWarnings, fakeHass } from './homeCard';

const NOW = 1_795_770_000;

function here(over: Partial<WarningSummary>): WarningHere {
	return {
		warning: {
			id: 'w1',
			apiId: 'api-1',
			cc: 'FR',
			source: 'meteofrance',
			level: 'ORANGE',
			levelOriginal: null,
			phenomenon: 'wind',
			area: 'Landes',
			sent: NOW - 3600,
			onset: NOW - 1800,
			expires: NOW + 7200,
			ends: null,
			shape: 's1',
			texts: [
				{ language: 'en', headline: 'Orange wind warning', event: 'Wind' },
				{ language: 'fr', headline: 'Vigilance orange vent', event: 'Vent violent' }
			],
			...over
		},
		river: false,
		distanceKm: null
	};
}

describe('the warnings of the place for the card', () => {
	it('in the shape of the integration: lower-case level, ISO times, the text in the language asked', () => {
		const w = cardWarnings('warnings', [here({})], 'fr', NOW, 'Météo-France');
		expect(w.max_level).toBe('orange');
		expect(w.note).toBeNull();
		expect(w.attribution).toBe('Météo-France');
		expect(w.vigilances).toEqual([
			{
				id: 'api-1',
				source: 'meteofrance',
				country: 'FR',
				level: 'orange',
				phenomenon: 'wind',
				headline: 'Vigilance orange vent',
				event: 'Vent violent',
				area: 'Landes',
				onset: new Date((NOW - 1800) * 1000).toISOString(),
				expires: new Date((NOW + 7200) * 1000).toISOString()
			}
		]);
	});

	it('leaves out a warning past its end, and ends with the end of the phenomenon when there is one', () => {
		const past = here({ id: 'old', level: 'RED', ends: NOW - 60, expires: NOW + 600 });
		const ends = here({ id: 'w2', apiId: null, ends: NOW + 3600 });
		const w = cardWarnings('warnings', [past, ends], 'en', NOW, null);
		expect(w.max_level).toBe('orange');
		expect(w.vigilances.map((v) => [v.id, v.expires, v.headline])).toEqual([
			['w2', new Date((NOW + 3600) * 1000).toISOString(), 'Orange wind warning']
		]);
	});

	it('the highest level first; green only is none', () => {
		const w = cardWarnings(
			'warnings',
			[here({ id: 'a', level: 'YELLOW' }), here({ id: 'b', level: 'RED' })],
			'fr',
			NOW,
			null
		);
		expect(w.max_level).toBe('red');
		expect(w.vigilances.map((v) => v.level)).toEqual(['red', 'yellow']);
		expect(cardWarnings('warnings', [here({ level: 'GREEN' })], 'fr', NOW, null).max_level).toBe('none');
		expect(cardWarnings('none', [], 'fr', NOW, null).max_level).toBe('none');
	});

	it('says when nothing can be told, and when no source covers the place', () => {
		for (const state of ['loading', 'failed', 'unplaced'] as const) {
			const w = cardWarnings(state, [], 'fr', NOW, null);
			expect([w.max_level, w.note]).toEqual([null, null]);
		}
		const none = cardWarnings('nosource', [], 'fr', NOW, null);
		expect(none.max_level).toBeNull();
		expect(none.note).toBeTruthy();
	});
});

describe('what the card is given', () => {
	it('the answer of the cell and the warnings, the rest null', () => {
		const point = { server_utc: NOW };
		const d = cardData({ name: 'Corte', lang: 'fr', answer: { point, read_utc: NOW }, warnings: null });
		expect(d).toMatchObject({ title: 'Corte', language: 'fr', read_utc: NOW, point, warnings: null });
		expect([d.tides, d.normals, d.forest_fire, d.spot, d.activities]).toEqual([null, null, null, null, null]);
	});

	it('the part of Home Assistant it reads: the language, dark or light, its one command', async () => {
		const d = cardData({ name: 'Corte', lang: 'en', answer: { point: {}, read_utc: null }, warnings: null });
		const hass = fakeHass('en', true, () => d);
		expect([hass.language, hass.locale.language, hass.themes.darkMode]).toEqual(['en', 'en', true]);
		await expect(hass.callWS({ type: 'vigie/card/data' })).resolves.toBe(d);
		await expect(hass.callWS({ type: 'vigie/card/spots' })).rejects.toEqual({ code: 'unknown_command' });
		await expect(fakeHass('fr', false, () => null).callWS({ type: 'vigie/card/data' })).rejects.toEqual({
			code: 'error'
		});
	});
});
