// The labels of the base map (OpenFreeMap styles, OpenMapTiles schema): its styles name places in English
// (`name_en`), and the tiles also carry the names in other languages (`name:fr`).
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Lang } from './i18n';

/** The text of a label in the page's language where the tiles have it, as before elsewhere; null to keep it. */
export function localizedTextField(field: unknown, lang: Lang): ExpressionSpecification | null {
	if (lang === 'en' || field == null || !JSON.stringify(field).includes('"name_en"')) return null;
	return ['coalesce', ['get', `name:${lang}`], field as ExpressionSpecification];
}
