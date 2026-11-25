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
