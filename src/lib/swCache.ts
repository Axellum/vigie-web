// The images the service worker keeps (src/service-worker/index.ts): the tiles and pictures of the map's layers, whose
// address changes with each image (a radar frame every 5 minutes, a PIAF run, an hour of forecast). Kept with the pages and
// the data, they were never forgotten until the next version of the site: a page left open on a screen piles up thousands
// of them. They are kept apart, the oldest put first to go.

/** The images kept at most: the radar and the PIAF nowcast of one view (26 frames of about 25 tiles), about 5 MB. */
export const MAX_IMAGES = 800;

/** Whether an answer of the site's data is an image (a tile or a picture of a layer). */
export function isDataImage(pathname: string, contentType: string | null): boolean {
	return pathname.startsWith('/data/') && (contentType ?? '').startsWith('image/');
}

/**
 * Deletes the oldest entries of a cache beyond `max` (a cache lists its entries in the order they were put, a put again
 * going last). Returns how many were deleted.
 */
export async function trimCache(cache: Pick<Cache, 'keys' | 'delete'>, max: number): Promise<number> {
	const keys = await cache.keys();
	const extra = keys.length - max;
	for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
	return Math.max(0, extra);
}

/**
 * Whether the worker answers a request for one of the site's own files (`assets`: the build and `static/`, kept at its install
 * under their bare paths) from the copy it kept. A file asked for with a query is a given version of it, such as
 * `/ha-card/vigie-card.js?v=<digest>` (widget/haCard.ts): the copy kept may be an older one, the one of the worker still in
 * place after a deployment until the new one takes over (seen on 2026-11-27: the widgets board drew the new page with the
 * previous card). That request goes to the network; the copy kept is its fallback without a network.
 */
export function fromKeptCopy(url: URL, assets: readonly string[]): boolean {
	return url.search === '' && assets.includes(url.pathname);
}
