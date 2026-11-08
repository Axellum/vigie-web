// The address of a television screen, written from the choices made on the page that sets one up (`/screens`). The screen itself reads
// it with `parseTvParams` (`params.ts`): the two are tested to agree, so that what the page shows is what the screen understands.
import { asLang, type Lang } from '../i18n';
import { TV_DEFAULTS, parseTvParams, type TvParams } from './params.js';

/** What the setup page holds: the parameters of the screen, and the language its words are written in. */
export interface TvSetup {
	params: TvParams;
	lang: Lang;
}

/**
 * Reads the choices from the address of the setup page, which uses the names of the screen's own parameters (`spot`, `preset`, `panels`,
 * `d`, `theme`, `r`, `reload`), so that a form sent as it is and a screen address are read by the same code. The language of the screen is
 * `tvlang` here, because `lang` is the one that sets the language of the page itself; it falls back to the language the page is shown in
 * (a television's browser does not necessarily speak the language of the shop it is in).
 */
export function parseSetup(query: URLSearchParams, pageLang: Lang): TvSetup {
	return { params: parseTvParams(query), lang: asLang(query.get('tvlang')) ?? pageLang };
}

/**
 * The path and query of the screen, or null while no place is chosen. Only what differs from the defaults is written, so that the
 * address stays short enough to be typed with a remote control, except the language: it is always there. Every value is made of
 * letters, digits, dashes and commas, so none needs escaping.
 */
export function tvPath(setup: TvSetup): string | null {
	const { params, lang } = setup;
	if (!params.spot) return null;
	const parts = [`spot=${params.spot}`];
	if (params.preset !== TV_DEFAULTS.preset) parts.push(`preset=${params.preset}`);
	if (params.panels.join(',') !== TV_DEFAULTS.panels.join(','))
		parts.push(`panels=${params.panels.join(',')}`);
	// The time a panel stays means nothing with a single panel.
	if (params.panels.length > 1 && params.seconds !== TV_DEFAULTS.seconds) parts.push(`d=${params.seconds}`);
	if (params.theme !== TV_DEFAULTS.theme) parts.push(`theme=${params.theme}`);
	parts.push(`lang=${lang}`);
	if (params.refreshSeconds !== TV_DEFAULTS.refreshSeconds) parts.push(`r=${params.refreshSeconds}`);
	if (params.reloadHours !== TV_DEFAULTS.reloadHours) parts.push(`reload=${params.reloadHours}`);
	return `/tv?${parts.join('&')}`;
}

/** The ways to order the panels, as the setup page offers them (the value is what the screen reads in `panels`). */
export const PANEL_CHOICES = ['cadran,verdicts', 'verdicts,cadran', 'cadran', 'verdicts'] as const;
export type PanelChoice = (typeof PANEL_CHOICES)[number];

/** The choice that holds the panels of these parameters, in their order. */
export function panelChoice(params: TvParams): PanelChoice {
	const joined = params.panels.join(',');
	return (PANEL_CHOICES as readonly string[]).includes(joined) ? (joined as PanelChoice) : PANEL_CHOICES[0];
}
