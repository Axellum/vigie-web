import { error, redirect } from '@sveltejs/kit';
import { t } from '#lib/i18n.js';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { ensureFirstPage } from '#lib/server/pages.js';
import { placeContext } from '#lib/server/placeContext.js';
import { listPlaces } from '#lib/server/savedPlaces.js';
import type { PageServerLoad } from './$types';

// A private page: it is made for one account, so no shared cache and not the service worker's either.
const PRIVATE = { 'cache-control': 'private, no-store' };

export const load: PageServerLoad = async ({ cookies, url, setHeaders, locals }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders(PRIVATE);
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	// The first time, the page is made from the zones already followed; the title is in the language of the visit.
	const page = await ensureFirstPage(sql, user.id, t(locals.lang, 'nav.me'));
	const places = await listPlaces(sql, user.id);
	return {
		user: { name: user.name },
		page: { id: page.id, title: page.title, blocks: page.blocks },
		places: places.map((p) => ({
			id: p.id,
			name: p.name,
			kind: p.kind,
			lat: p.lat,
			lon: p.lon,
			radiusKm: p.radiusKm,
			profile: p.profile
		})),
		...(await placeContext())
	};
};
