import { error, json } from '@sveltejs/kit';
import type { RainField } from '#lib/rainField.js';
import { ApiError, cacheHeaders, getRainField, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

// Global, Europe and France forecast rain overlays (`/data/rain-field`).
export const GET: RequestHandler = async () => {
	try {
		const { value, stale } = await getRainField();
		if (!value) error(502, 'The forecast rain field could not be read');
		const body: RainField = { ...value, stale: value.stale || stale };
		return json(body, { headers: cacheHeaders(TTL_S.rainField) });
	} catch (e) {
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
