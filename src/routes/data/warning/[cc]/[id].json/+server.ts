import { error, json } from '@sveltejs/kit';
import { ApiError, cacheHeaders, getWarnings, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await getWarnings(params.cc);
		if (!result) error(404, 'No source of official warnings for this country');
		const detail = result.value.details.get(params.id);
		if (!detail) error(404, 'This warning is not in force any more, or never was');
		return json({ ...detail, stale: result.stale }, { headers: cacheHeaders(TTL_S.warnings) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
