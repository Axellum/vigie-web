import { describe, expect, it } from 'vitest';
import { SEA_TEXT, seaText } from './text';

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
