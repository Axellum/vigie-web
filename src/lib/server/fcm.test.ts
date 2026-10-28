import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
// Getters, so that each test sees the settings it has just set.
vi.mock('$app/env/private', () => ({
	get VIGIE_FCM_SERVICE_ACCOUNT() {
		return env.VIGIE_FCM_SERVICE_ACCOUNT;
	},
	get VIGIE_FCM_BASE_URL() {
		return env.VIGIE_FCM_BASE_URL;
	}
}));

const { assertion, fcmMessage, isFcmToken, resetFcm, sendFcm, CHANNEL_OTHER, CHANNEL_RED } =
	await import('./fcm');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = {
	projectId: 'vigie-test',
	clientEmail: 'push@vigie-test.iam.gserviceaccount.com',
	privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
	tokenUri: 'https://oauth2.example.org/token'
};
const TOKEN = `dGVzdA:APA91b${'x'.repeat(140)}`;
const MESSAGE = { title: 'Rouge · Vent violent', body: 'Zone : Maison', url: '/warning/fr/1', tag: 'w:FR:1' };

function useAccount(): void {
	const dir = mkdtempSync(join(tmpdir(), 'vigie-fcm-'));
	const path = join(dir, 'sa.json');
	writeFileSync(
		path,
		JSON.stringify({
			type: 'service_account',
			project_id: SA.projectId,
			client_email: SA.clientEmail,
			private_key: SA.privateKey,
			token_uri: SA.tokenUri
		})
	);
	env.VIGIE_FCM_SERVICE_ACCOUNT = path;
	env.VIGIE_FCM_BASE_URL = 'https://fcm.example.org';
}

/** A fake fetch: the token endpoint, then FCM's answer for each send. */
function fakeFetch(...sends: Response[]) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
		calls.push({ url: String(url), init });
		if (String(url) === SA.tokenUri) return Response.json({ access_token: 'ya29.test', expires_in: 3599 });
		return sends.shift() ?? new Response(null, { status: 500 });
	});
	vi.stubGlobal('fetch', fn);
	return calls;
}

afterEach(() => {
	vi.unstubAllGlobals();
	delete env.VIGIE_FCM_SERVICE_ACCOUNT;
	delete env.VIGIE_FCM_BASE_URL;
	resetFcm();
});

describe('isFcmToken', () => {
	it('accepts a registration token and refuses anything else', () => {
		expect(isFcmToken(TOKEN)).toBe(true);
		expect(isFcmToken('short')).toBe(false);
		expect(isFcmToken(`${TOKEN} `)).toBe(false);
		expect(isFcmToken(`https://fcm.googleapis.com/${TOKEN}`)).toBe(false);
		expect(isFcmToken('x'.repeat(4097))).toBe(false);
		expect(isFcmToken(42)).toBe(false);
	});
});

describe('assertion', () => {
	it('is a JWT signed with the service account’s key, for the messaging scope, one hour long', () => {
		const jwt = assertion(SA, Date.UTC(2026, 9, 26, 12));
		const [header, claims, signature] = jwt.split('.');
		expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
			iss: SA.clientEmail,
			scope: 'https://www.googleapis.com/auth/firebase.messaging',
			aud: SA.tokenUri,
			iat: 1793016000,
			exp: 1793019600
		});
		const ok = createVerify('RSA-SHA256')
			.update(`${header}.${claims}`)
			.verify(publicKey, Buffer.from(signature, 'base64url'));
		expect(ok).toBe(true);
	});
});

describe('fcmMessage', () => {
	it('lets Android show the notification, with its page in data, urgent, for a day', () => {
		expect(fcmMessage(TOKEN, { ...MESSAGE, level: 'RED' })).toEqual({
			message: {
				token: TOKEN,
				notification: { title: MESSAGE.title, body: MESSAGE.body },
				data: { url: MESSAGE.url, tag: MESSAGE.tag },
				android: {
					ttl: '86400s',
					priority: 'HIGH',
					collapse_key: MESSAGE.tag,
					notification: { tag: MESSAGE.tag, channel_id: CHANNEL_RED }
				}
			}
		});
	});

	it('puts every other level, and the test, on the other channel', () => {
		const channel = (m: Record<string, unknown>) =>
			(m as { message: { android: { notification: { channel_id: string } } } }).message.android.notification
				.channel_id;
		expect(channel(fcmMessage(TOKEN, { ...MESSAGE, level: 'ORANGE' }))).toBe(CHANNEL_OTHER);
		expect(channel(fcmMessage(TOKEN, MESSAGE))).toBe(CHANNEL_OTHER);
	});
});

describe('sendFcm', () => {
	it('trades the JWT for an access token once, then posts to the project’s endpoint', async () => {
		useAccount();
		const calls = fakeFetch(Response.json({ name: 'projects/vigie-test/messages/1' }), Response.json({}));
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('sent');
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('sent');
		expect(calls.map((c) => c.url)).toEqual([
			SA.tokenUri,
			'https://fcm.example.org/v1/projects/vigie-test/messages:send',
			'https://fcm.example.org/v1/projects/vigie-test/messages:send'
		]);
		const form = new URLSearchParams(String(calls[0].init.body));
		expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
		expect(form.get('assertion')?.split('.')).toHaveLength(3);
		expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer ya29.test');
		expect(JSON.parse(String(calls[1].init.body)).message.token).toBe(TOKEN);
		expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true);
	});

	it('says "gone" when FCM no longer knows the device', async () => {
		useAccount();
		fakeFetch(
			Response.json(
				{ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
				{ status: 404 }
			)
		);
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('gone');
	});

	it('blames the server, not the device, when it has no access token', async () => {
		useAccount();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 400 }))
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('server');
	});

	it('asks for a new access token after a 401', async () => {
		useAccount();
		const calls = fakeFetch(new Response(null, { status: 401 }), Response.json({}));
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('server');
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('sent');
		expect(calls.filter((c) => c.url === SA.tokenUri)).toHaveLength(2);
	});

	it('gives any other status as it is', async () => {
		useAccount();
		fakeFetch(Response.json({ error: { status: 'INVALID_ARGUMENT' } }, { status: 400 }));
		expect(await sendFcm(TOKEN, MESSAGE)).toBe(400);
	});

	it('sends nothing without a service account', async () => {
		const calls = fakeFetch();
		expect(await sendFcm(TOKEN, MESSAGE)).toBe('server');
		expect(calls).toHaveLength(0);
	});
});
