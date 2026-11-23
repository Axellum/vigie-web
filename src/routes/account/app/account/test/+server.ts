import { error, json } from '@sveltejs/kit';
import { bearer } from '#lib/server/appDevices.js';
import { linkedPhone, linkTests } from '#lib/server/appLinks.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import { sendToUser } from '#lib/server/push.js';
import { t } from '#lib/i18n.js';
import type { RequestHandler } from './$types';

// A test notification to a phone linked to an account (`Authorization: Bearer <secret>`), in the account's language.
export const POST: RequestHandler = async ({ request }) => {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
	const secret = bearer(request.headers.get('authorization'));
	if (!secret) error(401, 'A phone secret is expected');
	const sql = await db();
	const phone = await linkedPhone(sql, secret);
	if (!phone) error(401, 'Unknown phone');
	if (!linkTests.take(phone.id)) error(429, 'Too many tests for this phone');
	const result = await sendToUser(
		sql,
		phone.userId,
		{
			title: t(phone.lang, 'notify.testTitle'),
			body: t(phone.lang, 'notify.testBody'),
			url: '/account',
			tag: 'test'
		},
		{ token: phone.token }
	);
	return json(
		{ sent: result?.sent ?? 0, failed: result?.failed ?? 0 },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
