// What the address of the widget page says: `/widget?size=medium&theme=sky&spot=anglet-la-madrague#43.483,-1.559/Biarritz`
// (`face=home` for the home and Details pages of the Home Assistant card instead).
// The size, the theme and the surf spot are in the query: they are the same for everybody and the server draws the spot. The place
// is after the `#`, so that it never reaches the server: the browser matches it against the warnings, and asks the weather of its
// cell of the grid only (about 5 km), as "near me" does. A value that is missing or makes no sense falls back to its default: a
// widget never shows an error for a typo.
import { parsePlace, type Place } from '../near';

export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/** The themes of the family's common charter: sky (a gradient and glass cards), plain dark, light. */
export const WIDGET_THEMES = ['sky', 'dark', 'light'] as const;
export type WidgetTheme = (typeof WIDGET_THEMES)[number];

export interface WidgetParams {
	size: WidgetSize;
	theme: WidgetTheme;
	/** The surf spot (its id in the API, from `/surf`); null when the address does not name one. */
	spot: string | null;
	/**
	 * `frame=board`: the page is a widget of the Windows widgets board, which writes the widget's name over its top 48 pixels
	 * (the "attribution area" of Microsoft's web widgets): the page leaves that band empty.
	 */
	board: boolean;
	/**
	 * `face=home`: the home and Details pages of the Home Assistant card instead of the widget, at the card's own size
	 * (480 × 760); what the Windows app shows in its flyout. Null: the widget.
	 */
	face: 'home' | null;
}

export const WIDGET_DEFAULTS = { size: 'medium', theme: 'sky' } as const satisfies Pick<
	WidgetParams,
	'size' | 'theme'
>;

/**
 * The layout for the height the Windows widgets board gives, its band of 48 pixels included. The board does not always give
 * the size it was asked: on Windows 11 in November 2026 it gave a medium web widget the frame of a large one, 300 × 462
 * (measured). From 360 pixels the large layout, which hides what does not fit, shows more than the medium one.
 */
export function boardSize(height: number): WidgetSize {
	return height >= 360 ? 'large' : height >= 200 ? 'medium' : 'small';
}

/** The same shape as the API's spot ids: letters, digits and dashes. */
const SPOT = /^[a-z0-9-]{1,80}$/;

const oneOf = <T extends string>(all: readonly T[], value: string | null | undefined, fallback: T): T => {
	const v = (value ?? '').trim().toLowerCase();
	return (all as readonly string[]).includes(v) ? (v as T) : fallback;
};

export function parseWidgetParams(query: URLSearchParams): WidgetParams {
	const spot = query.get('spot')?.trim().toLowerCase() ?? '';
	return {
		size: oneOf(WIDGET_SIZES, query.get('size'), WIDGET_DEFAULTS.size),
		theme: oneOf(WIDGET_THEMES, query.get('theme'), WIDGET_DEFAULTS.theme),
		spot: SPOT.test(spot) ? spot : null,
		board: query.get('frame')?.trim().toLowerCase() === 'board',
		face: query.get('face')?.trim().toLowerCase() === 'home' ? 'home' : null
	};
}

/** The place of the page and the name to show for it: `#43.483,-1.559/Biarritz`; null without a valid position. */
export function parseWidgetPlace(hash: string): (Place & { name: string | null }) | null {
	const raw = hash.replace(/^#/, '');
	const slash = raw.indexOf('/');
	const position = parsePlace(slash < 0 ? raw : raw.slice(0, slash));
	if (!position) return null;
	let name: string | null = null;
	if (slash >= 0) {
		try {
			name =
				decodeURIComponent(raw.slice(slash + 1))
					.trim()
					.slice(0, 60) || null;
		} catch {
			name = null;
		}
	}
	return { lat: position.lat, lon: position.lon, name };
}
