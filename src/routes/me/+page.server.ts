import { error, fail, redirect } from '@sveltejs/kit';
import { t } from '#lib/i18n.js';
import { parseTitle } from '#lib/pageConfig.js';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { ensureFirstPage, PageError, savePage } from '#lib/server/pages.js';
import { placeContext } from '#lib/server/placeContext.js';
import { listPlaces } from '#lib/server/savedPlaces.js';
import type { Actions, PageServerLoad } from './$types';

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
	// The place looked at alone, asked for in the address: the page draws it on the server too.
	const wanted = url.searchParams.get('place');
	return {
		selected: places.some((p) => p.id === wanted) ? wanted : null,
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

export const actions: Actions = {
	/** Saves the page as the person composed it: its title and its blocks, read again against their own places. */
	save: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
		const sql = await db();
		const user = await sessionUser(sql, cookies, url.protocol === 'https:');
		if (!user) redirect(303, '/login');
		const form = await request.formData();
		const id = form.get('page');
		const title = parseTitle(form.get('title'));
		if (typeof id !== 'string') return fail(400, { error: 'unknown' });
		if (!title) return fail(400, { error: 'title' });
		try {
			await savePage(sql, user.id, id, title, form.get('blocks'));
		} catch (e) {
			if (e instanceof PageError) return fail(400, { error: e.code });
			throw e;
		}
		return { saved: true };
	}
};
