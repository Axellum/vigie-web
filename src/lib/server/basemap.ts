// The style of the base map (OpenFreeMap), served by the site with the address of its tiles written in.
// Asked of OpenFreeMap, a style names its tiles by the address of a description (TileJSON), which names the tiles of the
// current planet: MapLibre asked for the style, then for that description, then for the first tiles, one after the other.
// The site asks for both itself and gives MapLibre the style with the tiles in it, from the address it already talks to:
// one request less before the first tile (measured on the home page from France, 2026-11-25: the description took about
// 50 ms between the style and the tiles).
import { BASEMAP_HOST } from '#lib/basemap.js';
import { TtlCache, type Cached } from './cache';

export const BASEMAP_STYLES = {
	light: `${BASEMAP_HOST}/styles/positron`,
	dark: `${BASEMAP_HOST}/styles/dark`
} as const;
export type BasemapTheme = keyof typeof BASEMAP_STYLES;

// OpenFreeMap lets a browser keep its styles a day and the description of its tiles an hour (their Cache-Control): the
// address of the tiles changes with each new planet, so a browser may use the previous one for up to an hour. The site
// asks again every 15 minutes and a browser keeps the site's copy 10: the address a visitor uses is never older than one
// OpenFreeMap's own description could have given.
export const BASEMAP_TTL_S = 15 * 60;
export const BASEMAP_BROWSER_TTL_S = 10 * 60;
const TIMEOUT_MS = 5_000;
// A style is about 25 kB and a description about 20 kB: a larger answer is not one of them.
const MAX_CHARS = 512 * 1024;
// The fields of a description that MapLibre takes for a source (`loadTileJson`), and that a source of a style may hold.
const TILE_FIELDS = ['tiles', 'minzoom', 'maxzoom', 'attribution', 'bounds', 'scheme'] as const;

type Json = Record<string, unknown>;

const styles = new TtlCache(Date.now, 15_000, 4);

async function readJson(url: string): Promise<Json> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (error) {
		throw new Error(`${url} unreachable (${(error as Error).name})`);
	}
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	const text = await response.text();
	if (text.length > MAX_CHARS) throw new Error(`${url} is too large`);
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${url} is not an object`);
	return value as Json;
}

const isTileUrl = (value: unknown): value is string =>
	typeof value === 'string' && value.startsWith(`${BASEMAP_HOST}/`);

/**
 * The style with each source that names a description of OpenFreeMap given that description's tiles instead. A source's
 * own fields win over the description's, as in MapLibre. A description whose tiles are elsewhere is refused (the pages may
 * only reach OpenFreeMap), and so is a style with no source left to read.
 */
export async function inlineTiles(style: Json, read: (url: string) => Promise<Json>): Promise<Json> {
	const sources = style.sources;
	if (!sources || typeof sources !== 'object') throw new Error('The style has no sources');
	const inlined: Json = {};
	for (const [id, source] of Object.entries(sources as Record<string, Json>)) {
		if (typeof source?.url !== 'string' || !source.url.startsWith(`${BASEMAP_HOST}/`)) {
			inlined[id] = source;
			continue;
		}
		const description = await read(source.url);
		const tiles = description.tiles;
		if (!Array.isArray(tiles) || tiles.length === 0 || !tiles.every(isTileUrl)) {
			throw new Error(`The tiles of ${source.url} are not on ${BASEMAP_HOST}`);
		}
		const own = Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'url'));
		const taken = Object.fromEntries(
			TILE_FIELDS.filter((key) => description[key] !== undefined).map((key) => [key, description[key]])
		);
		inlined[id] = { ...taken, ...own };
	}
	return { ...style, sources: inlined };
}

/** The style of a theme, with its tiles written in; kept 15 minutes, the last one served while OpenFreeMap fails. */
export function getBasemapStyle(theme: BasemapTheme): Promise<Cached<Json>> {
	return styles.get(theme, BASEMAP_TTL_S * 1000, async () =>
		inlineTiles(await readJson(BASEMAP_STYLES[theme]), readJson)
	);
}
