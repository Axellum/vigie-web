import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	countryFromApi,
	decodeEntities,
	healthFromApi,
	legend,
	mapLevel,
	overviewFromApi,
	statusLabel,
	textBlocks,
	TRAVEL_KEYS,
	whyNotRead,
	wholeCountry
} from './travel';

// Real answers of the API (2026-10-29): every country, Uganda (the ministries disagree), and the ECDC's publications.
const recorded = JSON.parse(readFileSync('e2e/fixtures/travel.json', 'utf-8'));
const uganda = JSON.parse(readFileSync('e2e/fixtures/travel-UG.json', 'utf-8'));
const health = JSON.parse(readFileSync('e2e/fixtures/travel-health.json', 'utf-8'));

describe('the ministries’ HTML as words', () => {
	it('keeps every word, in its order, without a tag', () => {
		const blocks = textBlocks(
			'<h3>Safety</h3><p>Avoid the <a href="https://x">border</a> area.<br>Stay&nbsp;alert.</p><ul><li>One</li><li>Two &amp; three</li></ul><script>alert(1)</script>'
		);
		expect(blocks).toEqual([
			{ kind: 'h', text: 'Safety' },
			{ kind: 'p', text: 'Avoid the border area.' },
			{ kind: 'p', text: 'Stay alert.' },
			{ kind: 'li', text: 'One' },
			{ kind: 'li', text: 'Two & three' }
		]);
	});

	it('decodes the entities it knows and leaves the others as written', () => {
		expect(decodeEntities('Côte d&#039;Ivoire &eacute; &#x2019; &unknown;')).toBe(
			"Côte d'Ivoire é ’ &unknown;"
		);
	});

	it('turns every recorded text into words with no markup left', () => {
		const detail = countryFromApi(uganda);
		for (const advice of detail?.advices ?? [])
			for (const text of advice.texts)
				for (const block of text.blocks) expect(block.text).not.toMatch(/<[a-z/][^>]*>/i);
	});
});

describe('the overview', () => {
	it('keeps each ministry and each country the API gave', () => {
		const o = overviewFromApi(recorded);
		expect(o.ministries.map((m) => m.id)).toEqual(recorded.ministries.map((m: { id: string }) => m.id));
		expect(o.countries.length).toBe(recorded.countries.length);
		const ug = o.countries.find((c) => c.country === 'UG');
		expect(ug?.comparison).toMatchObject({ disagree: true, gap: 2, strictest: ['us'] });
	});

	it('colours the map with the ministry’s own step, and the FCDO’s statuses (Vigie’s choice)', () => {
		const o = overviewFromApi(recorded);
		const ru = o.countries.find((c) => c.country === 'RU')!;
		expect(mapLevel(wholeCountry(ru.advices, 'gb')!)).toBe('RED');
		expect(mapLevel(wholeCountry(ru.advices, 'us')!)).toBe('RED');
		// The Dutch summary names several colours for Russia: no colour.
		expect(mapLevel(wholeCountry(ru.advices, 'nl')!)).toBeNull();
		expect(
			mapLevel({ ministry: 'gb', level: null, statuses: ['avoid_all_travel_to_parts'], commonMin: 1 })
		).toBe('YELLOW');
		expect(mapLevel({ ministry: 'gb', level: null, statuses: [], commonMin: 1 })).toBe('GREEN');
		expect(mapLevel({ ministry: 'gb', level: null, statuses: [], commonMin: null })).toBeNull();
		expect(mapLevel({ ministry: 'au', level: 3, statuses: [], commonMin: 3 })).toBe('ORANGE');
	});

	it('gives each colour of the legend the ministry’s words, or says the label is Vigie’s', () => {
		const o = overviewFromApi(recorded);
		const us = o.ministries.find((m) => m.id === 'us')!;
		expect(legend('fr', us).map((l) => [l.level, l.text, l.ours])).toEqual([
			['GREEN', 'Level 1: Exercise Normal Precautions', false],
			['YELLOW', 'Level 2: Exercise Increased Caution', false],
			['ORANGE', 'Level 3: Reconsider Travel', false],
			['RED', 'Level 4: Do Not Travel', false]
		]);
		const ca = o.ministries.find((m) => m.id === 'ca')!;
		expect(legend('fr', ca)[3]).toMatchObject({ language: 'fr', ours: false });
		const gb = o.ministries.find((m) => m.id === 'gb')!;
		expect(legend('fr', gb).every((l) => l.ours)).toBe(true);
	});
});

describe('one country', () => {
	it('keeps the advices, their words, the archive and the ECDC items that name it', () => {
		const d = countryFromApi(uganda)!;
		expect(d.country).toBe('UG');
		expect(d.advices.map((a) => a.ministry).sort()).toEqual(['au', 'ca', 'gb', 'nl', 'us']);
		const ca = d.advices.find((a) => a.ministry === 'ca')!;
		expect(ca.texts.map((t) => t.language)).toEqual(['en', 'fr']);
		expect(ca.levelTexts.fr).toBe('Éviter tout voyage non-essentiel (avec avertissements régionaux)');
		expect(d.history.length).toBe(uganda.history.length);
		expect(d.health?.items.length).toBe(uganda.health.items.length);
		expect(statusLabel('fr', d.advices.find((a) => a.ministry === 'gb')!.statuses)).toBe(
			'Ne déconseille pas de voyager'
		);
	});

	it('is null for an answer that is not a country', () => {
		expect(countryFromApi({ country: 'France' })).toBeNull();
	});
});

describe('the health answer', () => {
	it('keeps the ECDC’s items and says why the WHO and the CDC are linked only', () => {
		const h = healthFromApi(health);
		expect(h.items.length).toBe(health.items.length);
		expect(h.agencies.map((a) => [a.id, a.read])).toEqual([
			['ecdc', true],
			['who', false],
			['cdc', false]
		]);
		expect(whyNotRead('fr', h.agencies[1])).toContain('commerciale');
		expect(h.items.every((i) => i.countries === null || Array.isArray(i.countries))).toBe(true);
	});
});

it('has the same texts in French and English', () => {
	expect(TRAVEL_KEYS.en.sort()).toEqual(TRAVEL_KEYS.fr.sort());
});
