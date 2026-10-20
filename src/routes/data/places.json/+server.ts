import { error, json } from '@sveltejs/kit';
import { PLACES_ATTRIBUTION } from '$lib/places';
import { findPlaces } from '$lib/server/places';
import type { RequestHandler } from './$types';

/** Places whose name matches `q` (at least 2 letters), for the "near me" page. */
export const GET: RequestHandler = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < 2) error(400, 'q needs at least 2 letters');
	const places = findPlaces(query);
	if (!places) error(503, 'Place search is not available on this instance');
	// The list changes only with a new build: it can be kept a day.
	return json(
		{ places, attribution: PLACES_ATTRIBUTION },
		{ headers: { 'cache-control': 'public, max-age=86400' } }
	);
};
