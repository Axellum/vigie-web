import { error, fail, redirect } from '@sveltejs/kit';
import { asLang, t } from '#lib/i18n.js';
import { parseTitle } from '#lib/pageConfig.js';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { ensureFirstPage, PageError, savePage } from '#lib/server/pages.js';
import { setLangCookie } from '#lib/server/langCookie.js';
import { placeContext } from '#lib/server/placeContext.js';
import { listPlaces } from '#lib/server/savedPlaces.js';
import { prefsFromForm, readPrefs, savePrefs } from '#lib/server/userPrefs.js';
import { unitsOf } from '#lib/units.js';
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
		units: unitsOf(await readPrefs(sql, user.id)),
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
	/** The units of the figures, and the language of the site and of the alerts, for this account. */
	prefs: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
		const sql = await db();
		const user = await sessionUser(sql, cookies, url.protocol === 'https:');
		if (!user) redirect(303, '/login');
		const form = await request.formData();
		const sent = form.get('lang');
		const lang = typeof sent === 'string' ? asLang(sent) : null;
		await savePrefs(sql, user.id, prefsFromForm(form), lang);
		// The site follows at once: the same cookie as the language link of the header.
		if (lang) setLangCookie(cookies, lang, url.protocol === 'https:');
		return { prefsSaved: true };
	},

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
