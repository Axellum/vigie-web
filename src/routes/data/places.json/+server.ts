import { error, json } from '@sveltejs/kit';
import { PLACES_ATTRIBUTION } from '#lib/places.js';
import { findPlaces, placesAt } from '#lib/server/places.js';
import type { RequestHandler } from './$types';

/**
 * Places whose name matches `q` (at least 2 letters), for the "near me" page; or, with `lat` and `lon`, the
 * place that names that point (the Android app's place "Ici", which sends its position rounded to about 1 km).
 */
export const GET: RequestHandler = async ({ url }) => {
	const lat = url.searchParams.get('lat');
	const lon = url.searchParams.get('lon');
	let places;
	if (lat !== null || lon !== null) {
		const la = Number(lat);
		const lo = Number(lon);
		if (lat === null || lon === null || !Number.isFinite(la) || !Number.isFinite(lo)) {
			error(400, 'lat and lon must both be numbers');
		}
		if (Math.abs(la) > 90 || Math.abs(lo) > 180) error(400, 'lat and lon are out of range');
		places = placesAt(la, lo);
	} else {
		const query = (url.searchParams.get('q') ?? '').trim();
		if (query.length < 2) error(400, 'q needs at least 2 letters');
		places = findPlaces(query);
	}
	if (!places) error(503, 'Place search is not available on this instance');
	// The list changes only with a new build: it can be kept a day.
	return json(
		{ places, attribution: PLACES_ATTRIBUTION },
		{ headers: { 'cache-control': 'public, max-age=86400' } }
	);
};
