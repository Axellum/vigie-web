// The labels of the base map (OpenFreeMap styles, OpenMapTiles schema): its styles name places in English
// (`name_en`), and the tiles also carry the names in other languages (`name:fr`).
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Lang } from './i18n';

/** The host of the base map: its tiles, glyphs and sprites (the CSP of `vite.config.ts` lets the pages reach it). */
export const BASEMAP_HOST = 'https://tiles.openfreemap.org';
/** The style of each theme, served by the site with the address of the tiles written in (`src/lib/server/basemap.ts`). */
export const BASEMAP_STYLE_PATHS = {
	light: '/data/basemap/light.json',
	dark: '/data/basemap/dark.json'
} as const;

/** The text of a label in the page's language where the tiles have it, as before elsewhere; null to keep it. */
export function localizedTextField(field: unknown, lang: Lang): ExpressionSpecification | null {
	if (lang === 'en' || field == null || !JSON.stringify(field).includes('"name_en"')) return null;
	return ['coalesce', ['get', `name:${lang}`], field as ExpressionSpecification];
}
