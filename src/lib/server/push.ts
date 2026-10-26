// Web Push: the devices of an account and what is sent to them. The message is encrypted for the device
// (RFC 8291) and carried by the push service of its browser, which cannot read it. Optional: without
// VIGIE_VAPID_PUBLIC_KEY and VIGIE_VAPID_PRIVATE_KEY, nothing is sent and the account page does not offer it.
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import type { Query, Sql } from './db';

/** What a notification shows; the service worker draws it. */
export interface PushMessage {
	title: string;
	body: string;
	url: string;
	/** Notifications with the same tag replace each other on the device. */
	tag: string;
}

// The push services of the browsers. A subscription is a URL the server will POST to: only these hosts are
// accepted, so that an account cannot make the server call an address of its choosing.
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/^updates\.push\.services\.mozilla\.com$/,
	/^([a-z0-9-]+\.)*push\.apple\.com$/,
	/^([a-z0-9-]+\.)*notify\.windows\.com$/
];

export function pushEnabled(): boolean {
	return Boolean(env.VIGIE_VAPID_PUBLIC_KEY && env.VIGIE_VAPID_PRIVATE_KEY);
}

/** The public key the browser subscribes with; null when push is off. */
export function vapidPublicKey(): string | null {
	return pushEnabled() ? (env.VIGIE_VAPID_PUBLIC_KEY ?? null) : null;
}

function extraHosts(): string[] {
	return (env.VIGIE_PUSH_EXTRA_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);
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
	const o = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	const keys = o?.keys && typeof o.keys === 'object' ? (o.keys as Record<string, unknown>) : null;
	if (!o || !keys || !isPushEndpoint(o.endpoint)) return null;
	const { p256dh, auth } = keys;
	if (typeof p256dh !== 'string' || typeof auth !== 'string' || !KEY.test(p256dh) || !KEY.test(auth))
		return null;
	return { endpoint: o.endpoint, keys: { p256dh, auth } };
}

/** Five devices at most per account: the oldest goes when a sixth is added. */
const MAX_DEVICES = 5;

export async function saveSubscription(sql: Sql, userId: string, sub: Subscription): Promise<void> {
	await sql.begin(async (tx) => {
		// The same device subscribed again (or handed to another account): one row, the latest owner.
		await tx`delete from push_subscriptions where endpoint = ${sub.endpoint}`;
		await tx`
			insert into push_subscriptions (id, user_id, endpoint, p256dh, auth)
			values (${randomUUID()}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})`;
		await tx`
			delete from push_subscriptions where user_id = ${userId} and id not in (
				select id from push_subscriptions where user_id = ${userId} order by created_at desc limit ${MAX_DEVICES})`;
	});
}

export async function removeSubscription(sql: Sql, userId: string, endpoint: string): Promise<void> {
	await sql`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
}

export async function listDevices(
	sql: Sql,
	userId: string
): Promise<{ id: string; service: string; created_at: Date; last_sent_at: Date | null }[]> {
	const rows = await sql<{ id: string; endpoint: string; created_at: Date; last_sent_at: Date | null }[]>`
		select id, endpoint, created_at, last_sent_at from push_subscriptions
		where user_id = ${userId} order by created_at`;
	// The address itself is a secret of the device; the page only names its service.
	return rows.map(({ endpoint, ...r }) => ({ ...r, service: new URL(endpoint).hostname }));
}

/** Every device of an account, or one; null when push is off. */
export async function sendToUser(
	sql: Query,
	userId: string,
	message: PushMessage,
	endpoint?: string
): Promise<{ sent: number; failed: number } | null> {
	if (!pushEnabled()) return null;
	// Who sends, for the push service: an https: or mailto: address (a site on plain http gives the project's).
	const origin = env.ORIGIN?.startsWith('https://') ? env.ORIGIN : null;
	const subject = env.VIGIE_VAPID_SUBJECT || origin || 'https://github.com/Axellum/vigie-web';
	const rows = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
		select id, endpoint, p256dh, auth from push_subscriptions
		where user_id = ${userId} ${endpoint ? sql`and endpoint = ${endpoint}` : sql``}`;
	let sent = 0;
	let failed = 0;
	for (const row of rows) {
		let status: number | string;
		try {
			// web-push encrypts and signs; the request itself is sent here, without following a redirect.
			const request = webpush.generateRequestDetails(
				{ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
				JSON.stringify(message),
				{
					vapidDetails: {
						subject,
						publicKey: env.VIGIE_VAPID_PUBLIC_KEY!,
						privateKey: env.VIGIE_VAPID_PRIVATE_KEY!
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
			status = answer.status;
		} catch (err) {
			status = (err as Error).name;
		}
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
