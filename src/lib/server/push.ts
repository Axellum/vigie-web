// The devices of an account and what is sent to them. A browser's device gets Web Push: the message is
// encrypted for it (RFC 8291) and carried by the push service of its browser, which cannot read it. A device of
// the Android app gets Firebase Cloud Messaging (fcm.ts). Each is optional: without VIGIE_VAPID_PUBLIC_KEY and
// VIGIE_VAPID_PRIVATE_KEY, no Web Push; without VIGIE_FCM_SERVICE_ACCOUNT, no FCM.
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';

import {
	VIGIE_VAPID_PUBLIC_KEY,
	VIGIE_VAPID_PRIVATE_KEY,
	VIGIE_PUSH_EXTRA_HOSTS,
	ORIGIN,
	VIGIE_VAPID_SUBJECT
} from '$app/env/private';

import type { Level } from '#lib/types.js';
import type { Query, Sql } from './db';
import { fcmEnabled, sendFcm } from './fcm';

/** What a notification shows; the service worker draws it. */
export interface PushMessage {
	title: string;
	body: string;
	url: string;
	/** Notifications with the same tag replace each other on the device. */
	tag: string;
	/** The alert's level, for the app's notification channel (a test has none). */
	level?: Level;
}

// The push services of the browsers. A subscription is a URL the server will POST to: only these hosts are
// accepted, so that an account cannot make the server call an address of its choosing.
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/^updates\.push\.services\.mozilla\.com$/,
	/^([a-z0-9-]+\.)*push\.apple\.com$/,
	/^([a-z0-9-]+\.)*notify\.windows\.com$/
];

export function webPushEnabled(): boolean {
	return Boolean(VIGIE_VAPID_PUBLIC_KEY && VIGIE_VAPID_PRIVATE_KEY);
}

/** Whether the server sends notifications at all, to browsers or to the app. */
export function pushEnabled(): boolean {
	return webPushEnabled() || fcmEnabled();
}

/** The public key the browser subscribes with; null when Web Push is off. */
export function vapidPublicKey(): string | null {
	return webPushEnabled() ? VIGIE_VAPID_PUBLIC_KEY ?? null : null;
}

function extraHosts(): string[] {
	return (VIGIE_PUSH_EXTRA_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/** Whether an address is one of a push service (https), or one of the extra hosts set for tests. */
export function isPushEndpoint(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2000) return false;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (extraHosts().includes(url.host.toLowerCase())) return true;
	return url.protocol === 'https:' && url.port === '' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

const KEY = /^[A-Za-z0-9_-]{16,200}$/;

export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** A subscription as the browser gives it (`PushSubscription.toJSON()`), or null when it is not one. */
export function parseSubscription(value: unknown): Subscription | null {
	const o = value && typeof value === 'object' ? value as Record<string, unknown> : null;
	const keys = o?.keys && typeof o.keys === 'object' ? o.keys as Record<string, unknown> : null;
	if (!o || !keys || !isPushEndpoint(o.endpoint)) return null;
	const { p256dh, auth } = keys;
	if (typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY.test(p256dh) || !KEY.test(auth))
		return null;
	return { endpoint: o.endpoint, keys: { p256dh, auth } };
}

/** Five devices at most per account: the oldest goes when a sixth is added. */
const MAX_DEVICES = 5;

/** A device, as the account page's script names it: a browser's push address or the app's FCM token. */
export type Device = { endpoint: string } | { token: string };

/** The condition that selects a device's row. */
function byDevice(sql: Query, device: Device) {
	return 'endpoint' in device ? sql`endpoint = ${device.endpoint}` : sql`fcm_token = ${device.token}`;
}

async function keepLatest(tx: Query, userId: string): Promise<void> {
	await tx`
		delete from push_subscriptions where user_id = ${userId} and id not in (
			select id from push_subscriptions where user_id = ${userId} order by created_at desc limit ${MAX_DEVICES})`;
}

export async function saveSubscription(sql: Sql, userId: string, sub: Subscription): Promise<void> {
	await sql.begin(async (tx) => {
		// The same device subscribed again (or handed to another account): one row, the latest owner.
		await tx`delete from push_subscriptions where endpoint = ${sub.endpoint}`;
		await tx`
			insert into push_subscriptions (id, user_id, endpoint, p256dh, auth)
			values (${randomUUID()}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})`;
		await keepLatest(tx, userId);
	});
}

/** A device of the Android app, by its FCM registration token. */
export async function saveNativeDevice(sql: Sql, userId: string, token: string): Promise<void> {
	await sql.begin(async (tx) => {
		await tx`delete from push_subscriptions where fcm_token = ${token}`;
		await tx`insert into push_subscriptions (id, user_id, fcm_token) values (${randomUUID()}, ${userId}, ${token})`;
		await keepLatest(tx, userId);
	});
}

export async function removeDevice(sql: Sql, userId: string, device: Device): Promise<void> {
	await sql`delete from push_subscriptions where user_id = ${userId} and ${byDevice(sql, device)}`;
}

/** The id of a device in the account's list, or null when the server does not know it. */
export async function deviceId(sql: Sql, userId: string, device: Device): Promise<string | null> {
	const [row] = await sql<{ id: string }[]>`
		select id from push_subscriptions where user_id = ${userId} and ${byDevice(sql, device)}`;
	return row?.id ?? null;
}

export async function listDevices(
	sql: Sql,
	userId: string
): Promise<{ id: string; service: string | null; created_at: Date; last_sent_at: Date | null }[]> {
	const rows = await sql<
		{ id: string; endpoint: string | null; created_at: Date; last_sent_at: Date | null }[]
	>`
		select id, endpoint, created_at, last_sent_at from push_subscriptions
		where user_id = ${userId} order by created_at`;
	// The address itself is a secret of the device; the page only names its service (null: the app).
	return rows.map(({ endpoint, ...r }) => ({ ...r, service: endpoint ? new URL(endpoint).hostname : null }));
}

/** Every device of an account, or one; null when push is off. A device whose kind is off is left out. */
export async function sendToUser(
	sql: Query,
	userId: string,
	message: PushMessage,
	device?: Device
): Promise<{ sent: number; failed: number } | null> {
	if (!pushEnabled()) return null;
	// Who sends, for the push service: an https: or mailto: address (a site on plain http gives the project's).
	const origin = ORIGIN?.startsWith('https://') ? ORIGIN : null;

	const subject = VIGIE_VAPID_SUBJECT || origin || 'https://github.com/Axellum/vigie-web';

	const rows = await sql<{ 
		id: string;
		endpoint: string | null;
		p256dh: string;
		auth: string;
		fcm_token: string | null
	 }[]>`
		select id, endpoint, p256dh, auth, fcm_token from push_subscriptions
		where user_id = ${userId} ${device ? sql`and ${byDevice(sql, device)}` : sql``}`;
	let sent = 0;
	let failed = 0;
	for (const row of rows) {
		let status: number | string;
		if (row.fcm_token) {
			if (!fcmEnabled()) continue;
			const result = await sendFcm(row.fcm_token, message);
			// The server's own fault (no access token) does not count against the device.
			if (result === 'server') {
				failed++;
				continue;
			}
			status = result === 'sent' ? 200 : result === 'gone' ? 404 : result;
		} else if (row.endpoint && webPushEnabled()) {
			status = await sendWebPush(row as WebRow, message, subject);
		} else continue;
		if (typeof status === 'number' && status >= 200 && status < 300) {
			sent++;
			await sql`update push_subscriptions set last_sent_at = now(), failures = 0 where id = ${row.id}`;
			continue;
		}
		failed++;
		// 404 and 410: the device unsubscribed; it is forgotten. Other errors count, and five in a row too.
		if (status === 404 || status === 410) await sql`delete from push_subscriptions where id = ${row.id}`;
		else {
			const [after] = await sql<{ failures: number }[]>`
				update push_subscriptions set failures = failures + 1 where id = ${row.id} returning failures`;
			if ((after?.failures ?? 0) >= 5) await sql`delete from push_subscriptions where id = ${row.id}`;
		}
		console.error(`push: a device of an account failed (${status})`);
	}
	return { sent, failed };
}

type WebRow = { endpoint: string; p256dh: string; auth: string };

/** One Web Push message: the push service's HTTP status, or the error's name. */
async function sendWebPush(row: WebRow, message: PushMessage, subject: string): Promise<number | string> {
	// The browser's message keeps its four fields; the level only chooses the app's channel.
	const payload = { title: message.title, body: message.body, url: message.url, tag: message.tag };
	try {
		// web-push encrypts and signs; the request itself is sent here, without following a redirect.
		const request = webpush.generateRequestDetails(
			{ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
			JSON.stringify(payload),
			{
				vapidDetails: {
					subject,
					publicKey: VIGIE_VAPID_PUBLIC_KEY!,
					privateKey: VIGIE_VAPID_PRIVATE_KEY!
				},
				// An alert that waited a day on a phone that was off is no longer news.
				TTL: 24 * 3600,
				urgency: 'high'
			}
		);
		const answer = await fetch(request.endpoint, {
			method: request.method,
			headers: request.headers as Record<string, string>,
			body: request.body ? new Uint8Array(request.body) : undefined,
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000)
		});
		await answer.body?.cancel();
		return answer.status;
	} catch (err) {
		return (err as Error).name;
	}
}
