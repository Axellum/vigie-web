import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getTravel } from '#lib/server/vigie.js';
import { travelRows } from '#lib/travel.js';
import type { RequestHandler } from './$types';

/** The travel advice of every ministry read, reduced to a colour per country and ministry (as on the travel page), for the
 *  travel family of the home map: the same for everybody. */
export const GET: RequestHandler = async () => {
	try {
		const overview = (await getTravel()).value;
		return json(
			{
				ministries: overview.ministries,
				rows: travelRows(overview),
				attribution: overview.attribution,
				generated: overview.generated || null
			},
			{ headers: cacheHeaders(600) }
		);
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
