import { error, fail, redirect } from '@sveltejs/kit';
import { MAX_FOLLOWED } from '#lib/followed.js';
import { t } from '#lib/i18n.js';
import { MAX_PLACES, parseSavedPlace } from '#lib/myPlaces.js';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { appendStarterBlocks, ensureFirstPage } from '#lib/server/pages.js';
import {
	addPlace,
	listPlaces,
	PlaceError,
	removePlace,
	setHome,
	updatePlace
} from '#lib/server/savedPlaces.js';
import type { Actions, PageServerLoad } from './$types';

// Private, like the page it belongs to: no shared cache and not the service worker's either.
const PRIVATE = { 'cache-control': 'private, no-store' };

export const load: PageServerLoad = async ({ cookies, url, setHeaders, locals }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders(PRIVATE);
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	// Opened first, so that the zones already followed are offered as places before a first place is added by hand.
	await ensureFirstPage(sql, user.id, t(locals.lang, 'nav.me'));
	const places = await listPlaces(sql, user.id);
	return {
		max: MAX_PLACES,
		places: places.map((p) => ({
			id: p.id,
			name: p.name,
			kind: p.kind,
			lat: p.lat,
			lon: p.lon,
			radiusKm: p.radiusKm,
			profile: p.profile
		}))
	};
};

/** The person behind the request, and their page ready: the first page is made before anything is added. */
async function signedIn(event: Parameters<Actions[string]>[0]) {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	const sql = await db();
	const user = await sessionUser(sql, event.cookies, event.url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	await ensureFirstPage(sql, user.id, t(event.locals.lang, 'nav.me'));
	return { sql, user };
}

function refused(e: unknown) {
	if (e instanceof PlaceError) return fail(400, { error: e.code });
	throw e;
}

export const actions: Actions = {
	/** A new place, with its first cards on the page when the person kept the box ticked. */
	add: async (event) => {
		const { sql, user } = await signedIn(event);
		const form = await event.request.formData();
		const parsed = parseSavedPlace(form, 'place');
		if (!parsed.ok) return fail(400, { error: parsed.error });
		try {
			const id = await addPlace(sql, user.id, parsed.place);
			if (form.get('cards') === 'on') await appendStarterBlocks(sql, user.id, id);
			return { done: 'added' as const, place: id };
		} catch (e) {
			return refused(e);
		}
	},

	/** What the person typed about a place again: its name, point, radius and profile. */
	update: async (event) => {
		const { sql, user } = await signedIn(event);
		const form = await event.request.formData();
		const id = form.get('id');
		if (typeof id !== 'string') return fail(400, { error: 'unknown' });
		// The home keeps its coarse point: the kind is read from the database, not from the form.
		const kind = (await listPlaces(sql, user.id)).find((p) => p.id === id)?.kind;
		if (!kind) return fail(400, { error: 'unknown' });
		const parsed = parseSavedPlace(form, kind);
		if (!parsed.ok) return fail(400, { error: parsed.error });
		try {
			await updatePlace(sql, user.id, id, parsed.place);
			return { done: 'updated' as const, place: id };
		} catch (e) {
			return refused(e);
		}
	},

	/** The home: made the first time, then moved. About 1 km is all that is kept of where it is. */
	home: async (event) => {
		const { sql, user } = await signedIn(event);
		const form = await event.request.formData();
		const parsed = parseSavedPlace(form, 'home');
		if (!parsed.ok) return fail(400, { error: parsed.error });
		const had = (await listPlaces(sql, user.id)).some((p) => p.kind === 'home');
		const id = await setHome(sql, user.id, parsed.place);
		if (!had && form.get('cards') === 'on') await appendStarterBlocks(sql, user.id, id);
		return { done: 'home' as const, place: id };
	},

	/** The places followed in this browser, sent once the person asked for them to be added (they were never sent
	 *  before). The ones that do not read are left out, and the list stops where the account is full. */
	import: async (event) => {
		const { sql, user } = await signedIn(event);
		const form = await event.request.formData();
		let list: unknown;
		try {
			list = JSON.parse(String(form.get('places') ?? ''));
		} catch {
			return fail(400, { error: 'shape' });
		}
		if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FOLLOWED)
			return fail(400, { error: 'shape' });
		let count = 0;
		for (const item of list) {
			if (!item || typeof item !== 'object') continue;
			const parsed = parseSavedPlace({ get: (key) => (item as Record<string, unknown>)[key] }, 'place');
			if (!parsed.ok) continue;
			try {
				const id = await addPlace(sql, user.id, parsed.place);
				count++;
				if (form.get('cards') === 'on') await appendStarterBlocks(sql, user.id, id);
			} catch (e) {
				if (e instanceof PlaceError && e.code === 'full') break;
				return refused(e);
			}
		}
		return count > 0 ? { done: 'imported' as const, count } : fail(400, { error: 'shape' });
	},

	/** A place goes, and so do its cards on every page of the account. */
	remove: async (event) => {
		const { sql, user } = await signedIn(event);
		const id = (await event.request.formData()).get('id');
		if (typeof id !== 'string') return fail(400, { error: 'unknown' });
		try {
			await removePlace(sql, user.id, id);
			return { done: 'removed' as const };
		} catch (e) {
			return refused(e);
		}
	}
};
