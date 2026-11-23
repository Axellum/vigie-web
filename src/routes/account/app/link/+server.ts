import { error, json } from '@sveltejs/kit';
import { AppLinkError, linkStarts, startAppLink } from '#lib/server/appLinks.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import type { RequestHandler } from './$types';

// The Android app asks a code to link itself to an account (appLinks.ts): JSON `{ token }`, its Firebase token.
// The answer is the code to show (`XXXX-XXXX`), the app's waiting token for `/account/app/link/poll` and the end of
// the code. Like every write of the app, the request says `Content-Type: application/json`.
const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const token = body?.token;
	if (typeof token !== 'string') error(400, 'Bad request (token)');
	if (!linkStarts.take(getClientAddress())) error(429, 'Too many codes from this address');
	try {
		const start = await startAppLink(await db(), token);
		return json(
			{ code: start.code, wait: start.wait, expiresAt: Math.floor(start.expiresAt.getTime() / 1000) },
			{ status: 201, headers: NO_STORE }
		);
	} catch (err) {
		if (err instanceof AppLinkError) error(400, 'Bad request (token)');
		throw err;
	}
};
