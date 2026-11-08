import { publicOrigin } from '#lib/server/origin.js';
import { countryPaths, placePaths, sitemapXml, STATIC_PATHS } from '#lib/seo.js';
import { ApiError, getNamedPlaceIds, servedCodes } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The fixed pages, one page per served country and one per place of the coast that has a name (the API's lists, cached by the
// server like the pages that use them). Not the pages of a warning, an area or a hazard: they come and go, and the countries'
// pages link to the current ones. Not prerendered: the lists are the API's, known at run time.
export const GET: RequestHandler = async ({ setHeaders }) => {
	let codes: string[] = [];
	let known = true;
	try {
		codes = await servedCodes();
		known = codes.length > 0;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
		known = false;
	}
	// The places of the coast are all there or none: a list cut short is not kept.
	let places: string[] = [];
	try {
		places = (await getNamedPlaceIds()).value;
	} catch (e) {
		if (!(e instanceof ApiError)) throw e;
	}
	// When the API cannot tell, the sitemap still lists the fixed pages, and a proxy keeps it only briefly.
	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': known ? 'public, max-age=3600, s-maxage=3600' : 'public, max-age=60, s-maxage=60'
	});
	return new Response(
		sitemapXml(publicOrigin(), [...STATIC_PATHS, ...countryPaths(codes), ...placePaths(places)])
	);
};
