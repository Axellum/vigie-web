import { publicOrigin } from '#lib/server/origin.js';
import { countryPaths, sitemapXml, STATIC_PATHS } from '#lib/seo.js';
import { ApiError, servedCodes } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// The fixed pages and one page per served country (the API's list, cached by the server like the pages that
// use it). Not the pages of a warning, an area or a hazard: they come and go, and the countries' pages link
// to the current ones. Not prerendered: the list of countries is the API's, known at run time.
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
	// When the API cannot tell, the sitemap still lists the fixed pages, and a proxy keeps it only briefly.
	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': known ? 'public, max-age=3600, s-maxage=3600' : 'public, max-age=60, s-maxage=60'
	});
	return new Response(sitemapXml(publicOrigin(), [...STATIC_PATHS, ...countryPaths(codes)]));
};
