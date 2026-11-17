import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	basinOf,
	BUOYS_TEXT,
	buoysText,
	seaBuoyFromApi,
	seaBuoysFromApi,
	waveDetails,
	waveHeight,
	windLine
} from './buoys';

const recorded = JSON.parse(
	readFileSync(join(import.meta.dirname, '../../../e2e/fixtures/sea-buoys.json'), 'utf-8')
);

describe('the offshore buoys', () => {
	it('has every text in both languages, with the same placeholders', () => {
		expect(Object.keys(BUOYS_TEXT.en).sort()).toEqual(Object.keys(BUOYS_TEXT.fr).sort());
		const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(BUOYS_TEXT.fr) as (keyof typeof BUOYS_TEXT.fr)[])
			expect(holes(BUOYS_TEXT.en[key]), key).toEqual(holes(BUOYS_TEXT.fr[key]));
	});

	it('reads the recorded answer and puts each buoy in its sea', () => {
		const answer = seaBuoysFromApi(recorded);
		expect(answer?.status).toBe('ok');
		expect(answer?.buoys).toHaveLength(10);
		const byName = Object.fromEntries(answer!.buoys.map((b) => [b.name, b]));
		expect(basinOf(byName.Gascogne)).toBe('atlantic');
		expect(basinOf(byName.Lion)).toBe('mediterranean');
		expect(basinOf(byName.Sardaigne)).toBe('mediterranean');
		expect(basinOf(byName.Antilles)).toBe('overseas');
		expect(answer!.attribution).toMatch(/^Source: Météo-France/);
	});

	it('says the waves and the wind in words, and leaves out what was not measured', () => {
		const answer = seaBuoysFromApi(recorded)!;
		const gascogne = answer.buoys.find((b) => b.name === 'Gascogne')!;
		expect(waveHeight('fr', gascogne)).toBe('4 m');
		expect(waveDetails('fr', gascogne)).toBe('période 7 s · de OSO');
		expect(windLine('fr', gascogne)).toBe('58 km/h de SO · rafales 76 km/h');
		expect(windLine('en', gascogne)).toBe('58 km/h from SW · gusts 76 km/h');
		const sardaigne = answer.buoys.find((b) => b.name === 'Sardaigne')!;
		expect(waveHeight('fr', sardaigne)).toBeNull();
		expect(waveDetails('fr', sardaigne)).toBeNull();
	});

	it('refuses an answer or a buoy it cannot place', () => {
		expect(seaBuoysFromApi({ status: 'bogus' })).toBeNull();
		expect(seaBuoysFromApi({ status: 'unavailable' })?.buoys).toEqual([]);
		expect(seaBuoyFromApi({ id: '1', name: 'X', lat: 1 })).toBeNull();
		expect(buoysText('en', 'none', { hours: 3 })).toBe('No buoy has sent a record in the last 3 hours.');
	});
});
