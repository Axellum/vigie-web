import { json } from '@sveltejs/kit';
import { accountsEnabled, db } from '#lib/server/db.js';
import { PAIR_COOKIE, decodePairCookie, pollPairing } from '#lib/server/tvPairing.js';
import type { RequestHandler } from './$types';

const NO_STORE = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow'
};

export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!accountsEnabled()) {
		return json({ status: 'expired' }, { headers: NO_STORE });
	}
	const parsed = decodePairCookie(cookies.get(PAIR_COOKIE));
	if (!parsed) {
		return json({ status: 'expired' }, { headers: NO_STORE });
	}
	const result = await pollPairing(await db(), parsed.waitToken, parsed.rawCode);
	if (result.status === 'ready') {
		cookies.delete(PAIR_COOKIE, { path: '/tv/pair', secure: url.protocol === 'https:' });
		return json({ status: 'ready', location: `/tv/p/${result.token}` }, { headers: NO_STORE });
	}
	if (result.status === 'expired') {
		cookies.delete(PAIR_COOKIE, { path: '/tv/pair', secure: url.protocol === 'https:' });
		return json({ status: 'expired' }, { headers: NO_STORE });
	}
	return json({ status: 'pending' }, { headers: NO_STORE });
};
