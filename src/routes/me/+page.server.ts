import { error, fail, redirect } from '@sveltejs/kit';
import { asLang, t } from '#lib/i18n.js';
import { parseTitle } from '#lib/pageConfig.js';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { createLink, LinkError, listLinks, MAX_LINKS, revokeLink } from '#lib/server/pageLinks.js';
import { ensureFirstPage, PageError, savePage } from '#lib/server/pages.js';
import { setLangCookie } from '#lib/server/langCookie.js';
import { placeContext } from '#lib/server/placeContext.js';
import { listPlaces } from '#lib/server/savedPlaces.js';
import { prefsFromForm, readPrefs, savePrefs } from '#lib/server/userPrefs.js';
import { TV_CARDS } from '#lib/tv/shared.js';
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
		// The private links of the page (never a secret: only the name, the dates and the hash that names it), and what a
		// screen can draw of the page (the cards of `TV_CARDS`, the others are left out of its turns).
		links: (await listLinks(sql, user.id, page.id)).filter((l) => !l.revoked),
		maxLinks: MAX_LINKS,
		tvCards: [...TV_CARDS] as string[],
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
	},

	/**
	 * Makes a private link for the page. The address is returned once, in the answer of this form, and kept nowhere: not in
	 * the address of this page, not in a cookie, not in a log. Only its SHA-256 is stored (`pageLinks.ts`).
	 */
	linkMake: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
		const sql = await db();
		const user = await sessionUser(sql, cookies, url.protocol === 'https:');
		if (!user) redirect(303, '/login');
		const form = await request.formData();
		const page = form.get('page');
		const label = form.get('label');
		if (typeof page !== 'string') return fail(400, { linkError: 'unknown' });
		try {
			const token = await createLink(sql, user.id, page, typeof label === 'string' ? label.trim() : '');
			return { madeLink: `/tv/p/${token}` };
		} catch (e) {
			if (e instanceof LinkError) return fail(400, { linkError: e.code });
			throw e;
		}
	},

	/** Revokes a link of this account; the screen that uses it reads a 404 at its next reading. */
	linkRevoke: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
		const sql = await db();
		const user = await sessionUser(sql, cookies, url.protocol === 'https:');
		if (!user) redirect(303, '/login');
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string') return fail(400, { linkError: 'unknown' });
		try {
			await revokeLink(sql, user.id, id);
		} catch (e) {
			if (e instanceof LinkError) return fail(400, { linkError: e.code });
			throw e;
		}
		return { revokedLink: true };
	}
};
