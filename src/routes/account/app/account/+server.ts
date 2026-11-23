import { error, json } from '@sveltejs/kit';
import {
	AppLinkError,
	linkedAccount,
	linkedPhone,
	unlinkPhone,
	updateLinkedToken
} from '#lib/server/appLinks.js';
import { bearer } from '#lib/server/appDevices.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import type { RequestHandler } from './$types';

// A phone linked to an account by a code (appLinks.ts), with `Authorization: Bearer <secret>`:
// GET the account's name, quiet hours and zones; PUT `{ token }` a new Firebase token; DELETE unlinks the phone.
// 401 when the secret is unknown: the phone was unlinked on the site, or replaced (the app shows it unlinked).
const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

function open(): void {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
}

function secretOf(request: Request): string {
	const secret = bearer(request.headers.get('authorization'));
	if (!secret) error(401, 'A phone secret is expected');
	return secret;
}

export const GET: RequestHandler = async ({ request }) => {
	open();
	const sql = await db();
	const phone = await linkedPhone(sql, secretOf(request));
	const account = phone ? await linkedAccount(sql, phone.userId) : null;
	if (!account) error(401, 'Unknown phone');
	return json(account, { headers: NO_STORE });
};

export const PUT: RequestHandler = async ({ request }) => {
	open();
	const secret = secretOf(request);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const token = body?.token;
	if (typeof token !== 'string') error(400, 'Bad request (token)');
	try {
		if (!(await updateLinkedToken(await db(), secret, token))) error(401, 'Unknown phone');
	} catch (err) {
		if (err instanceof AppLinkError) error(400, 'Bad request (token)');
		throw err;
	}
	return json({ ok: true }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async ({ request }) => {
	open();
	if (!(await unlinkPhone(await db(), secretOf(request)))) error(401, 'Unknown phone');
	return json({ ok: true }, { headers: NO_STORE });
};
