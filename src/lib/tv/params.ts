// What the address of a television screen says (`/tv?spot=…&preset=club&d=20`). Everything is read from the address, nothing
// from a cookie or an account: a screen is set once, by the link someone types or scans, and keeps it for days. A value that is
// missing or makes no sense falls back to its default: the screen never shows an error for a typo.

/** Who looks at the screen: it picks which instruments and which cards are shown. */
export const TV_PRESETS = ['port', 'club', 'shop'] as const;
export type TvPreset = (typeof TV_PRESETS)[number];

/** The panels that take turns on the screen: the instruments, then the verdict cards. */
export const TV_PANELS = ['cadran', 'verdicts'] as const;
export type TvPanel = (typeof TV_PANELS)[number];

export type TvTheme = 'auto' | 'day' | 'night';

export interface TvParams {
	/** The surf spot (its id in the API, from `/surf`); null when the address does not name one. */
	spot: string | null;
	preset: TvPreset;
	panels: TvPanel[];
	/** Seconds each panel stays. */
	seconds: number;
	theme: TvTheme;
	/** Seconds between two reads of the page by the screen. */
	refreshSeconds: number;
	/** Hours between two complete reloads of the page, against a memory that grows over days. */
	reloadHours: number;
}

export const TV_DEFAULTS = {
	preset: 'port',
	panels: ['cadran', 'verdicts'],
	seconds: 20,
	theme: 'auto',
	refreshSeconds: 300,
	reloadHours: 12
} as const satisfies Omit<TvParams, 'spot'>;

/** The same shape as the API's spot ids: letters, digits and dashes. */
const SPOT = /^[a-z0-9-]{1,80}$/;

function whole(value: string | null, min: number, max: number, fallback: number): number {
	if (value == null || !/^\d{1,6}$/.test(value)) return fallback;
	return Math.min(max, Math.max(min, Number(value)));
}

export function parseTvParams(query: URLSearchParams): TvParams {
	const spot = query.get('spot')?.trim().toLowerCase() ?? '';
	const preset = query.get('preset')?.trim().toLowerCase();
	const panels = (query.get('panels') ?? '')
		.split(',')
		.map((p) => p.trim().toLowerCase())
		.filter(
			(p, i, all): p is TvPanel => (TV_PANELS as readonly string[]).includes(p) && all.indexOf(p) === i
		);
	const theme = query.get('theme')?.trim().toLowerCase();
	return {
		spot: SPOT.test(spot) ? spot : null,
		preset: (TV_PRESETS as readonly string[]).includes(preset ?? '')
			? (preset as TvPreset)
			: TV_DEFAULTS.preset,
		panels: panels.length ? panels : [...TV_DEFAULTS.panels],
		seconds: whole(query.get('d'), 5, 300, TV_DEFAULTS.seconds),
		theme: theme === 'day' || theme === 'night' ? theme : TV_DEFAULTS.theme,
		// Not under a minute (the answers are kept ten minutes anyway), not over an hour (a screen that is not read looks frozen).
		refreshSeconds: whole(query.get('r'), 60, 3600, TV_DEFAULTS.refreshSeconds),
		reloadHours: whole(query.get('reload'), 1, 48, TV_DEFAULTS.reloadHours)
	};
}
