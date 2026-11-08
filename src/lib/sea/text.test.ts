import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_SENTENCES, apiSentence, SEA_TEXT, seaText } from './text';

describe('the words of the sea pages', () => {
	it('has every text in both languages, with the same placeholders', () => {
		expect(Object.keys(SEA_TEXT.en).sort()).toEqual(Object.keys(SEA_TEXT.fr).sort());
		const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(SEA_TEXT.fr) as (keyof typeof SEA_TEXT.fr)[])
			expect(holes(SEA_TEXT.en[key]), key).toEqual(holes(SEA_TEXT.fr[key]));
	});

	it('fills the placeholders, and falls back to French, then to the key', () => {
		expect(seaText('en', 'place', { place: 'Biarritz' })).toBe('Around Biarritz');
		expect(seaText('fr', 'place', { place: 'Biarritz' })).toBe('Autour de Biarritz');
		expect(seaText('en', 'no.such.key')).toBe('no.such.key');
	});

	it('keeps the French accents and the degree-free wording of the page', () => {
		expect(SEA_TEXT.fr.title).toBe('Aller à l’eau ?');
		expect(SEA_TEXT.fr.warnRed).toContain('Vigilance');
	});
});

describe('the English sentences of the API, said in French on a French page', () => {
	const fixture = (name: string) =>
		JSON.parse(readFileSync(new URL(`../../../e2e/fixtures/${name}`, import.meta.url), 'utf-8')) as {
			limits: string;
			disclaimer: string;
		};
	const overview = fixture('activities-overview.json');
	const surf = fixture('surf-hossegor.json');
	const recorded = [overview.limits, overview.disclaimer, surf.limits];
	// The API's source says it (`_NO_TIDE_NOTE`, app/services/activities.py); no recording has an activity that cannot be judged.
	const NO_TIDE =
		'No tide model near this spot, or none for these dates: shore fishing cannot be judged here.';

	it('are the very ones the API gives: the English side is held to the recorded answers', () => {
		const english = API_SENTENCES.map((s) => s.en);
		for (const sentence of recorded) expect(english).toContain(sentence);
		expect(english.filter((en) => !recorded.includes(en))).toEqual([NO_TIDE]);
	});

	it('are said in French, with the same figures, on a French page', () => {
		for (const sentence of API_SENTENCES) {
			expect(apiSentence('fr', sentence.en)).toEqual({ text: sentence.fr, lang: 'fr' });
			expect(sentence.fr).not.toBe(sentence.en);
			for (const figure of sentence.en.match(/\d+(?: km| m)?/g) ?? []) expect(sentence.fr).toContain(figure);
		}
		// The whitespace around the API's sentence does not matter.
		expect(apiSentence('fr', ` ${API_SENTENCES[1].en} `).lang).toBe('fr');
	});

	it('stay as the API gives them, marked English, when the page is English or the API has reworded them', () => {
		expect(apiSentence('en', API_SENTENCES[0].en)).toEqual({ text: API_SENTENCES[0].en, lang: 'en' });
		const reworded = 'Not for safety: look at the sea first.';
		expect(apiSentence('fr', reworded)).toEqual({ text: reworded, lang: 'en' });
	});
});
