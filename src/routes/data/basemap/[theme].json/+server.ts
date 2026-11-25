import { error, redirect } from '@sveltejs/kit';
import { BASEMAP_HOST } from '#lib/basemap.js';
import {
	BASEMAP_BROWSER_TTL_S,
	BASEMAP_STYLES,
	getBasemapStyle,
	type BasemapTheme
} from '#lib/server/basemap.js';
import type { RequestHandler } from './$types';

// The style of the base map with the address of its tiles written in: /data/basemap/light.json, /data/basemap/dark.json.
// When the site cannot make it (OpenFreeMap not reached since the site started), the map is sent to OpenFreeMap's own
// style, as before.
export const GET: RequestHandler = async ({ params }) => {
	const theme = params.theme;
	if (!Object.hasOwn(BASEMAP_STYLES, theme)) error(404, 'No such style');
	let style: Record<string, unknown>;
	try {
		style = (await getBasemapStyle(theme as BasemapTheme)).value;
	} catch {
		redirect(302, BASEMAP_STYLES[theme as BasemapTheme], { external: [BASEMAP_HOST] });
	}
	return Response.json(style, { headers: { 'cache-control': `public, max-age=${BASEMAP_BROWSER_TTL_S}` } });
};
