import { describe, expect, it } from 'vitest';
import { PANEL_CHOICES, panelChoice, parseSetup, tvPath, type TvSetup } from './address.js';
import { TV_DEFAULTS, TV_PANELS, TV_PRESETS, parseTvParams } from './params.js';
import { SETUP_TEXT } from './setupText.js';

const query = (s: string) => new URLSearchParams(s);
const setup = (s: string, lang: 'fr' | 'en' = 'fr'): TvSetup => parseSetup(query(s), lang);

describe('the address of a screen', () => {
	it('is not made until a place is chosen', () => {
		expect(tvPath(setup(''))).toBeNull();
		expect(tvPath(setup('spot=Not%20A%20Spot!'))).toBeNull();
	});

	it('keeps only what differs from the defaults, and always the language', () => {
		expect(tvPath(setup('spot=hossegor-plage-centrale'))).toBe('/tv?spot=hossegor-plage-centrale&lang=fr');
		expect(
			tvPath(
				setup('spot=biarritz&preset=club&panels=verdicts,cadran&d=30&theme=night&tvlang=en&r=600&reload=6')
			)
		).toBe('/tv?spot=biarritz&preset=club&panels=verdicts,cadran&d=30&theme=night&lang=en&r=600&reload=6');
	});

	it('writes the defaults out when they are given as they are', () => {
		const given = `spot=x&preset=${TV_DEFAULTS.preset}&panels=${TV_DEFAULTS.panels.join(',')}&d=${TV_DEFAULTS.seconds}&theme=${TV_DEFAULTS.theme}&r=${TV_DEFAULTS.refreshSeconds}&reload=${TV_DEFAULTS.reloadHours}`;
		expect(tvPath(setup(given))).toBe('/tv?spot=x&lang=fr');
	});

	it('takes the language of the page when the address names none or a wrong one', () => {
		expect(setup('spot=x', 'en').lang).toBe('en');
		expect(setup('spot=x&tvlang=de', 'en').lang).toBe('en');
		expect(setup('spot=x&lang=fr', 'en').lang).toBe('en'); // `lang` is the language of the page, not of the screen
		expect(setup('spot=x&tvlang=fr', 'en').lang).toBe('fr');
	});

	it('says nothing of how long a panel stays when there is only one', () => {
		expect(tvPath(setup('spot=x&panels=verdicts&d=45'))).toBe('/tv?spot=x&panels=verdicts&lang=fr');
		expect(tvPath(setup('spot=x&panels=cadran,verdicts&d=45'))).toBe('/tv?spot=x&d=45&lang=fr');
	});

	it('is read by the screen as the choices were made, for every preset, panel order, theme and language', () => {
		for (const preset of TV_PRESETS) {
			for (const panels of PANEL_CHOICES) {
				for (const theme of ['auto', 'day', 'night']) {
					for (const lang of ['fr', 'en'] as const) {
						const made = setup(
							`spot=hossegor&preset=${preset}&panels=${panels}&d=45&theme=${theme}&r=120&reload=3&tvlang=${lang}`
						);
						const path = tvPath(made);
						expect(path).not.toBeNull();
						// What the television does with the address: it reads the query with the screen's own parser.
						const read = parseTvParams(new URL(path ?? '', 'https://example.org').searchParams);
						const wanted = made.params.panels.length > 1 ? made.params.seconds : TV_DEFAULTS.seconds;
						expect(read).toEqual({ ...made.params, seconds: wanted });
						expect(new URL(path ?? '', 'https://example.org').searchParams.get('lang')).toBe(lang);
					}
				}
			}
		}
	});

	it('keeps a value out of range as the screen reads it, not as it was typed', () => {
		const made = setup('spot=x&d=9999&r=1&reload=0');
		expect(made.params.seconds).toBe(300);
		expect(tvPath(made)).toBe('/tv?spot=x&d=300&lang=fr&r=60&reload=1');
	});
});

describe('the choice of panels', () => {
	it('offers every panel on its own and both in either order, and nothing else', () => {
		expect([...PANEL_CHOICES].sort()).toEqual(['cadran', 'cadran,verdicts', 'verdicts', 'verdicts,cadran']);
		for (const panel of TV_PANELS) expect(PANEL_CHOICES).toContain(panel);
	});

	it('is found again from the parameters, and falls back to both panels', () => {
		for (const choice of PANEL_CHOICES)
			expect(panelChoice(setup(`spot=x&panels=${choice}`).params)).toBe(choice);
		expect(panelChoice(setup('spot=x&panels=nonsense').params)).toBe('cadran,verdicts');
	});
});

describe('the words of the setup page', () => {
	it('are the same keys in French and in English, none empty', () => {
		expect(Object.keys(SETUP_TEXT.en).sort()).toEqual(Object.keys(SETUP_TEXT.fr).sort());
		for (const lang of ['fr', 'en'] as const) {
			for (const [key, value] of Object.entries(SETUP_TEXT[lang]))
				expect(value.trim(), `${lang} ${key}`).not.toBe('');
		}
	});

	it('name a text for each preset, its help, each way to order the panels and each theme', () => {
		for (const lang of ['fr', 'en'] as const) {
			const words = SETUP_TEXT[lang] as Record<string, string>;
			for (const preset of TV_PRESETS) {
				expect(words[preset], `${lang} ${preset}`).toBeTruthy();
				expect(words[`${preset}Help`], `${lang} ${preset}Help`).toBeTruthy();
			}
			for (const choice of PANEL_CHOICES)
				expect(words[`panels.${choice}`], `${lang} panels.${choice}`).toBeTruthy();
			for (const theme of ['auto', 'day', 'night'])
				expect(words[`theme.${theme}`], `${lang} theme.${theme}`).toBeTruthy();
		}
	});
});
