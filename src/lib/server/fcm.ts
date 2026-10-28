// Firebase Cloud Messaging (HTTP v1): the notifications of the Android app. The server signs a short JWT with
// the key of a Google service account, trades it for an access token (one hour), and posts one message per
// device. Optional: without VIGIE_FCM_SERVICE_ACCOUNT, nothing is sent through FCM.
//
// Unlike Web Push, the message is not encrypted for the device: Google carries its title and body in clear, as
// it does for the notifications of any Android app. The privacy page says so.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { VIGIE_FCM_SERVICE_ACCOUNT, VIGIE_FCM_BASE_URL } from '$app/env/private';
import type { PushMessage } from './push';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** The notification channels the app creates (android/), by importance. */
export const CHANNEL_RED = 'vigie-red';
export const CHANNEL_OTHER = 'vigie-alerts';

interface ServiceAccount {
	projectId: string;
	clientEmail: string;
	privateKey: string;
	tokenUri: string;
}

let account: { path: string; value: ServiceAccount } | null = null;

/** The service account of the file VIGIE_FCM_SERVICE_ACCOUNT, read once; null when FCM is off. */
function serviceAccount(): ServiceAccount | null {
	const path = VIGIE_FCM_SERVICE_ACCOUNT;
	if (!path) return null;
	if (account?.path === path) return account.value;
	const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	const { project_id, client_email, private_key, token_uri } = raw;
	if (typeof project_id !== 'string' || typeof client_email !== 'string' || typeof private_key !== 'string')
		throw new Error('VIGIE_FCM_SERVICE_ACCOUNT is not the JSON key of a service account');
	const value = {
		projectId: project_id,
		clientEmail: client_email,
		privateKey: private_key,
		tokenUri: typeof token_uri === 'string' ? token_uri : GOOGLE_TOKEN_URI
	};
	account = { path, value };
	return value;
}

export function fcmEnabled(): boolean {
	return Boolean(VIGIE_FCM_SERVICE_ACCOUNT);
}

/** A registration token as the app gives it. */
export function isFcmToken(value: unknown): value is string {
	return typeof value === 'string' && (/^[A-Za-z0-9_:-]{32,4096}$/).test(value);
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/** The signed JWT a service account trades for an access token (RFC 7523). */
export function assertion(sa: ServiceAccount, now = Date.now()): string {
	const iat = Math.floor(now / 1000);
	const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = base64url(
		JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: sa.tokenUri, iat, exp: iat + 3600 })
	);
	const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.privateKey);
	return `${header}.${claims}.${base64url(signature)}`;
}

let cached: { token: string; until: number } | null = null;
let inFlight: Promise<string> | null = null;

async function fetchToken(sa: ServiceAccount): Promise<string> {
	const answer = await fetch(sa.tokenUri, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: assertion(sa)
		}),
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});
	if (!answer.ok) {
		await answer.body?.cancel();
		throw new Error(`token ${answer.status}`);
	}

	const { access_token, expires_in } = await answer.json() as { access_token?: string; expires_in?: number };

	if (!access_token) throw new Error('token without access_token');
	// Renewed one minute before it ends.
	cached = { token: access_token, until: Date.now() + Math.max(60, (expires_in ?? 3600) - 60) * 1000 };
	return access_token;
}

/** The access token, cached until a minute before it ends; one request at a time. */
async function accessToken(sa: ServiceAccount): Promise<string> {
	if (cached && cached.until > Date.now()) return cached.token;
	inFlight ??= fetchToken(sa).finally(() => inFlight = null);
	return inFlight;
}

/** The FCM message for one device: shown by Android itself when the app is closed, its page in `data`. */
export function fcmMessage(token: string, message: PushMessage): Record<string, unknown> {
	return {
		message: {
			token,
			notification: { title: message.title, body: message.body },
			data: { url: message.url, tag: message.tag },
			android: {
				// An alert that waited a day on a phone that was off is no longer news (as for Web Push).
				ttl: '86400s',
				priority: 'HIGH',
				collapse_key: message.tag.slice(0, 64),
				notification: {
					tag: message.tag,
					channel_id: message.level === 'RED' ? CHANNEL_RED : CHANNEL_OTHER
				}
			}
		}
	};
}

/**
 * Sends one message. The answer: 'sent'; 'gone' when FCM says the device no longer exists (it is then
 * forgotten); 'server' when the fault is this server's (no access token): the device is not blamed; else the
 * HTTP status or the error's name.
 */
export async function sendFcm(
	token: string,
	message: PushMessage
): Promise<'sent' | 'gone' | 'server' | number | string> {
	const sa = serviceAccount();
	if (!sa) return 'server';
	let bearer: string;
	try {
		bearer = await accessToken(sa);
	} catch (err) {
		console.error(`fcm: no access token (${(err as Error).message})`);
		return 'server';
	}
	const base = VIGIE_FCM_BASE_URL || 'https://fcm.googleapis.com';
	try {
		const answer = await fetch(`${base}/v1/projects/${encodeURIComponent(sa.projectId)}/messages:send`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
			body: JSON.stringify(fcmMessage(token, message)),
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000)
		});
		if (answer.ok) {
			await answer.body?.cancel();
			return 'sent';
		}

		const detail = await answer.json().catch(() => null) as 
			{ 
				error?: { status?: string; details?: { errorCode?: string }[] }
			 } |
			null;

		const codes = [
			detail?.error?.status,
			...(detail?.error?.details ?? []).map((d) => d.errorCode)
		];

		if (answer.status === 404 || codes.includes('UNREGISTERED')) return 'gone';
		// A refused access token is this server's fault: the next send asks for another one.
		if (answer.status === 401) {
			cached = null;
			return 'server';
		}
		return answer.status;
	} catch (err) {
		return (err as Error).name;
	}
}

/** For the tests: forgets the service account and the access token. */
export function resetFcm(): void {
	account = null;
	cached = null;
	inFlight = null;
}
