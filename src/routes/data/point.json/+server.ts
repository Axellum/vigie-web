import { error, json } from '@sveltejs/kit';
import { SESSION_COOKIE, sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { ApiError, BudgetError, cacheHeaders, getPoint, TTL_S } from '#lib/server/vigie.js';
import type { RequestHandler } from './$types';

/** Weather at a point. The page sends the position already rounded to the weather grid (about 5 km). */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const read = (name: string) => {
		const raw = url.searchParams.get(name);
		return raw === null || raw.trim() === '' ? NaN : Number(raw);
	};
	const lat = read('lat'),
		lon = read('lon');
	if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) error(400, 'lat and lon are required');
	const marine = url.searchParams.get('marine') === '1';
	let accountId: string | undefined;
	if (accountsEnabled() && cookies.get(SESSION_COOKIE)) {
		try {
			const user = await sessionUser(await db(), cookies, url.protocol === 'https:');
			accountId = user?.id;
		} catch {
			// A temporary database failure falls back to the public budget rather than failing weather lookups.
		}
	}
	try {
		const { value, stale } = await getPoint(lat, lon, marine, accountId);
		return json({ ...value, stale }, { headers: cacheHeaders(TTL_S.point) });
	} catch (e) {
		if (e instanceof BudgetError) {
			return json(
				{ reason: 'budget' },
				{ status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '3600' } }
			);
		}
		if (e instanceof ApiError) error(502, e.message);
		throw e;
	}
};
