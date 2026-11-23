import { error, json } from '@sveltejs/kit';
import { etagMatches } from '#lib/server/etag.js';
import { ApiError, cacheHeaders, getHazards, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The list changes only when the site's cache reads it again (`fetchedAt`): a page that asks every minute gets a 304, with no body,
// while it has not.
export const GET: RequestHandler = async ({ request }) => {
	try {
		const { value, stale, fetchedAt } = await getHazards();
		const etag = `W/"hz-${fetchedAt}${stale ? '-stale' : ''}"`;
		const headers = { ...cacheHeaders(TTL_S.hazards), etag };
		if (etagMatches(request.headers.get('if-none-match'), etag))
			return new Response(null, { status: 304, headers });
		return json({ ...value, stale }, { headers });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
