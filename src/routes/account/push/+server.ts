import { error, json } from '@sveltejs/kit';
import { sessionUser } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import {
	isPushEndpoint,
	parseSubscription,
	pushEnabled,
	removeSubscription,
	saveSubscription,
	sendToUser
} from '$lib/server/push';
import { t } from '$lib/i18n';
import type { RequestHandler } from './$types';

// The devices of an account, called by the account page's script (JSON, same origin only):
// status (whether the server knows this device), subscribe (the browser's subscription and its time zone),
// unsubscribe, and a test notification.
export const POST: RequestHandler = async ({ request, url, cookies }) => {
	if (!accountsEnabled() || !pushEnabled()) error(404, 'Notifications are not open on this server');
	if (request.headers.get('origin') !== url.origin) error(403, 'Cross-site request');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body expected');
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) error(401, 'Not signed in');
	const noStore = { 'cache-control': 'no-store' };
	switch (body.action) {
		case 'status': {
			// A device removed from the list (from another device) is not added back without asking.
			if (!isPushEndpoint(body.endpoint)) return json({ id: null }, { headers: noStore });
			const [row] = await sql<{ id: string }[]>`
				select id from push_subscriptions where user_id = ${user.id} and endpoint = ${body.endpoint}`;
			return json({ id: row?.id ?? null }, { headers: noStore });
		}
		case 'subscribe': {
			const sub = parseSubscription(body.subscription);
			if (!sub) error(400, 'Not a subscription of a known push service');
			await saveSubscription(sql, user.id, sub);
			const zone = typeof body.timeZone === 'string' && validZone(body.timeZone) ? body.timeZone : null;
			if (zone) await sql`update users set time_zone = ${zone} where id = ${user.id}`;
			return json({ ok: true }, { headers: noStore });
		}
		case 'unsubscribe': {
			if (!isPushEndpoint(body.endpoint)) error(400, 'Unknown device');
			await removeSubscription(sql, user.id, body.endpoint);
			return json({ ok: true }, { headers: noStore });
		}
		case 'test': {
			if (!isPushEndpoint(body.endpoint)) error(400, 'Unknown device');
			const lang = user.lang;
			const result = await sendToUser(
				sql,
				user.id,
				{
					title: t(lang, 'notify.testTitle'),
					body: t(lang, 'notify.testBody'),
					url: '/account',
					tag: 'test'
				},
				body.endpoint
			);
			return json({ sent: result?.sent ?? 0, failed: result?.failed ?? 0 }, { headers: noStore });
		}
		default:
			error(400, 'Unknown action');
	}
};

function validZone(zone: string): boolean {
	if (zone.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}
