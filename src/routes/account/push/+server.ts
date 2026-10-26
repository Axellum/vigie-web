import { error, json } from '@sveltejs/kit';
import { sessionUser } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import { fcmEnabled, isFcmToken } from '$lib/server/fcm';
import {
	deviceId,
	isPushEndpoint,
	parseSubscription,
	pushEnabled,
	removeDevice,
	saveNativeDevice,
	saveSubscription,
	sendToUser,
	webPushEnabled,
	type Device
} from '$lib/server/push';
import { t } from '$lib/i18n';
import type { RequestHandler } from './$types';

// The devices of an account, called by the account page's script (JSON, same origin only):
// status (whether the server knows this device), subscribe (the browser's subscription and its time zone),
// register (the Android app's FCM token and its time zone), unsubscribe, and a test notification. A device is
// named by `endpoint` (a browser) or `token` (the app).
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
			const device = deviceOf(body);
			if (!device) return json({ id: null }, { headers: noStore });
			return json({ id: await deviceId(sql, user.id, device) }, { headers: noStore });
		}
		case 'subscribe': {
			if (!webPushEnabled()) error(404, 'Web Push is not open on this server');
			const sub = parseSubscription(body.subscription);
			if (!sub) error(400, 'Not a subscription of a known push service');
			await saveSubscription(sql, user.id, sub);
			await saveTimeZone(sql, user.id, body.timeZone);
			return json({ ok: true }, { headers: noStore });
		}
		case 'register': {
			if (!fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
			if (!isFcmToken(body.token)) error(400, 'Not a registration token');
			await saveNativeDevice(sql, user.id, body.token);
			await saveTimeZone(sql, user.id, body.timeZone);
			return json({ ok: true }, { headers: noStore });
		}
		case 'unsubscribe': {
			const device = deviceOf(body);
			if (!device) error(400, 'Unknown device');
			await removeDevice(sql, user.id, device);
			return json({ ok: true }, { headers: noStore });
		}
		case 'test': {
			const device = deviceOf(body);
			if (!device) error(400, 'Unknown device');
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
				device
			);
			return json({ sent: result?.sent ?? 0, failed: result?.failed ?? 0 }, { headers: noStore });
		}
		default:
			error(400, 'Unknown action');
	}
};

/** The device a request names: a browser's push address or the app's token. */
function deviceOf(body: Record<string, unknown>): Device | null {
	if (isPushEndpoint(body.endpoint)) return { endpoint: body.endpoint };
	if (isFcmToken(body.token)) return { token: body.token };
	return null;
}

async function saveTimeZone(sql: Awaited<ReturnType<typeof db>>, userId: string, value: unknown) {
	const zone = typeof value === 'string' && validZone(value) ? value : null;
	if (zone) await sql`update users set time_zone = ${zone} where id = ${userId}`;
}

function validZone(zone: string): boolean {
	if (zone.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}
