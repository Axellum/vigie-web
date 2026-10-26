import { error, fail, redirect } from '@sveltejs/kit';
import { closeSession, deleteUser, sessionUser } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import { listZoneAlerts } from '$lib/server/notify';
import { PasskeyError, removePasskey } from '$lib/server/passkeys';
import { listDevices, vapidPublicKey } from '$lib/server/push';
import { servedCodes } from '$lib/server/vigie';
import { listZones, removeZone, ZoneError } from '$lib/server/zones';
import { MAX_ZONES } from '$lib/zones';
import type { Actions, PageServerLoad } from './$types';

// A private page: never kept by a shared cache or by the service worker.
const PRIVATE = { 'cache-control': 'private, no-store' };

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders(PRIVATE);
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	const passkeys = await sql<
		{ id: string; backed_up: boolean; created_at: Date; last_used_at: Date | null }[]
	>`
		select id, backed_up, created_at, last_used_at from passkeys where user_id = ${user.id} order by created_at`;
	const [settings] = await sql<
		{ quiet_hours: boolean }[]
	>`select quiet_hours from users where id = ${user.id}`;
	const unix = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);
	return {
		user: { name: user.name, createdAt: Math.floor(user.createdAt.getTime() / 1000) },
		zones: await listZones(sql, user.id),
		served: await servedCodes(),
		maxZones: MAX_ZONES,
		passkeys: passkeys.map((p) => ({
			id: p.id,
			backedUp: p.backed_up,
			createdAt: Math.floor(p.created_at.getTime() / 1000),
			lastUsedAt: p.last_used_at ? Math.floor(p.last_used_at.getTime() / 1000) : null
		})),
		push: {
			publicKey: vapidPublicKey(),
			devices: (await listDevices(sql, user.id)).map((d) => ({
				id: d.id,
				service: d.service,
				createdAt: unix(d.created_at),
				lastSentAt: unix(d.last_sent_at)
			})),
			quietHours: settings?.quiet_hours ?? false
		},
		alerts: (await listZoneAlerts(sql, user.id)).map((a) => ({ ...a, matchedAt: unix(a.matched_at) })),
		now: Math.floor(Date.now() / 1000)
	};
};

async function signedIn(cookies: Parameters<PageServerLoad>[0]['cookies'], url: URL) {
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	return { sql, user };
}

export const actions: Actions = {
	logout: async ({ cookies, url }) => {
		if (!accountsEnabled()) error(404);
		await closeSession(await db(), cookies, url.protocol === 'https:');
		redirect(303, '/');
	},
	removePasskey: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const { sql, user } = await signedIn(cookies, url);
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string') return fail(400, { error: 'unknown' });
		try {
			await removePasskey(sql, user.id, id);
		} catch (e) {
			if (e instanceof PasskeyError) return fail(400, { error: e.code });
			throw e;
		}
		return { removed: true };
	},
	removeZone: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const { sql, user } = await signedIn(cookies, url);
		const id = (await request.formData()).get('id');
		try {
			await removeZone(sql, user.id, typeof id === 'string' ? id : '');
		} catch (e) {
			if (e instanceof ZoneError) return fail(400, { error: `zone.${e.code}` });
			throw e;
		}
		return { zoneRemoved: true };
	},
	removeDevice: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const { sql, user } = await signedIn(cookies, url);
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return fail(400, { error: 'unknown' });
		await sql`delete from push_subscriptions where id = ${id} and user_id = ${user.id}`;
		return { deviceRemoved: true };
	},
	quiet: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const { sql, user } = await signedIn(cookies, url);
		const form = await request.formData();
		const on = form.get('quiet') === 'on';
		await sql`update users set quiet_hours = ${on} where id = ${user.id}`;
		return { quietSaved: true };
	},
	delete: async ({ cookies, url, request }) => {
		if (!accountsEnabled()) error(404);
		const { sql, user } = await signedIn(cookies, url);
		if ((await request.formData()).get('confirm') !== 'yes') return fail(400, { error: 'confirm' });
		await deleteUser(sql, user.id);
		await closeSession(sql, cookies, url.protocol === 'https:');
		redirect(303, '/login?deleted=1');
	}
};
