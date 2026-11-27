// The medium and large widgets of a place are the Home Assistant card itself (`static/ha-card/vigie-card.js`), its home page drawn
// smaller: the author wanted the widget to be the card (2026-11-27), and the card's own rules fit its blocks to its height. This is
// how the page frames it: the scale, the size the card is given at that scale, the room left at the top and the bottom, and the
// style put into the card's shadow root to leave out what a widget has no room for. Pure, so that it is tested.
import type { WidgetForecast, WidgetFrame, WidgetTheme } from './params';

export type CardSize = 'medium' | 'large';

/**
 * The height the card's home page needs at scale 1 (card pixels, its padding of the top and the bottom left out), measured on
 * 2026-11-27 with the real card and the data of Bordeaux: the medium widget without the facts of now and with the block of the
 * hours (351) or of the days (415 with the gusts of three days under their wind), the large one with everything (610); a few
 * pixels more for a longer word. Given less, the card flattens its curves and shortens its columns of the days, whose last line
 * then goes over their foot. The hours are given more than they need: drawn larger than 0.74, the card is narrower than about
 * 405 px and leaves out the gust of now. At 300 × 303 and 300 × 462, the board's whole frames, this gives 0.74, 0.68 and 0.68.
 */
export const CARD_NEED = { hours: 390, days: 425, large: 625 } as const;

export const cardNeed = (size: CardSize, forecast: WidgetForecast) =>
	size === 'large' ? CARD_NEED.large : CARD_NEED[forecast];

/** Above this width (card pixels) the card turns to its wide layout (`WIDE_PX`, 640): the widget stays under it. */
export const CARD_MAX_WIDTH = 600;

export interface CardFrame {
	/** The scale of the card in the page. */
	scale: number;
	/** The width and the height of the card, in card pixels. */
	width: number;
	height: number;
	/** The left of the card in the page (page pixels): centred when the page is wider than the card may be. */
	left: number;
	/** The room above and under the card's blocks, in card pixels. */
	top: number;
	bottom: number;
}

/**
 * The frame of the card in a page `width` × `height`. At the top, the band of the Windows widgets board (`frame=board`, 48 px),
 * or room for its « ··· » menu when the board has no band (`frame=bare`): the large card's facts of now sit in the top right
 * corner, the medium card has none. The scale follows the height; a page wider than the card may be has it in its middle.
 */
export function cardFrame(
	size: CardSize,
	forecast: WidgetForecast,
	frame: WidgetFrame | null,
	width: number,
	height: number
): CardFrame {
	const top = frame === 'board' ? 48 : frame === 'bare' && size === 'large' ? 28 : 8,
		bottom = 6;
	const room = Math.max(1, height - top - bottom);
	// Rounded first: the page scales the card by this very number, and the card's height must cover the page's.
	const scale = Math.round(Math.min(1.25, Math.max(0.5, room / cardNeed(size, forecast))) * 100) / 100;
	const cardWidth = Math.min(width / scale, CARD_MAX_WIDTH);
	return {
		scale,
		width: Math.round(cardWidth),
		height: Math.ceil(height / scale),
		left: Math.max(0, Math.round((width - cardWidth * scale) / 2)),
		top: Math.round(top / scale),
		bottom: Math.round(bottom / scale)
	};
}

/** The background of the widget behind the card, and the colour the card punches its dots with (`--vc-carte`). */
export const CARD_BACKGROUND: Record<WidgetTheme, { page: string; card: string }> = {
	sky: { page: 'linear-gradient(#1f4477, #305783)', card: '#284d7d' },
	dark: { page: '#19232e', card: '#19232e' },
	light: { page: '#ffffff', card: '#ffffff' }
};

/**
 * The style put into the card's shadow root. Out: the name of the place and its bar of pages (the widget is one page of one place,
 * named in the app), the titles of the blocks, and in the medium widget the facts of now and the block not chosen (the next 24
 * hours or the next days, `fc`). The card's height is the widget's; the rain tile lets its title have the room it needs (its bars
 * shrink first: otherwise « Pas de pluie dans l'heure » is cut at this width); the blocks are centred in the height.
 */
export function cardStyle(
	f: CardFrame,
	size: CardSize,
	forecast: WidgetForecast,
	theme: WidgetTheme
): string {
	const hide = ['.root > .entete', '.root > .entete + div', '.nav', '.bloc > .st'];
	if (size === 'medium') {
		hide.push('.now-f');
		hide.push(forecast === 'days' ? '.pile > .bloc:has(.hr)' : '.pile > .bloc:has(.dh)');
	}
	return (
		`${hide.join(',')}{display:none !important}` +
		`ha-card{height:${f.height}px !important;border:none !important;border-radius:0 !important;box-shadow:none !important;background:transparent !important;--vc-carte:${CARD_BACKGROUND[theme].card} !important}` +
		`.root{padding-top:${f.top}px !important;padding-bottom:${f.bottom}px !important}` +
		'.tuile .tb{flex-basis:0 !important}' +
		// What the widget does not fill is shared above and under the blocks rather than left at the foot.
		'.page{display:flex !important;flex-direction:column !important}.pile{margin-block:auto !important}'
	);
}

/**
 * Whether the card draws its home page of France (the weather now, the rain of the hour, the hours and the days) for this answer:
 * the card's own rule (`inFrance`: Météo-France's forecast; the site gives it no normals). Elsewhere, or when the API fell back to
 * another forecast, its home page holds the warnings only: the widget then shows the frise instead.
 */
export function cardDrawsHome(point: unknown): boolean {
	const provider = (point as { weather_provider?: unknown } | null)?.weather_provider;
	return typeof provider === 'string' && provider.startsWith('Météo-France');
}
