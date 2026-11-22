import { error, json } from '@sveltejs/kit';
import type { ObservedRain } from '#lib/observedRain.js';
import { ApiError, cacheHeaders, getObservedRain, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// Global observed satellite precipitation metadata (`/data/rain-observed`).
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getObservedRain();
		if (!value) error(502, 'The observed rain layer could not be read');
		const body: ObservedRain = { ...value, stale: value.stale || stale };
		return json(body, { headers: cacheHeaders(TTL_S.observedRain) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
