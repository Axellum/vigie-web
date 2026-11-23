import { error, json } from '@sveltejs/kit';
import { bearer, deviceBySecret, sendToDevice, tests } from '#lib/server/appDevices.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import { t } from '#lib/i18n.js';
import type { RequestHandler } from './$types';

// A test notification to a device of the app (`Authorization: Bearer <secret>`): what an alert will look like.
export const POST: RequestHandler = async ({ request }) => {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
	const secret = bearer(request.headers.get('authorization'));
	if (!secret) error(401, 'A device secret is expected');
	const sql = await db();
	const device = await deviceBySecret(sql, secret);
	if (!device) error(401, 'Unknown device');
	if (!tests.take(device.id)) error(429, 'Too many tests for this device');
	const result = await sendToDevice(sql, device.id, {
		title: t(device.lang, 'notify.testTitle'),
		body: t(device.lang, 'notify.appTestBody'),
		url: '/',
		tag: 'test'
	});
	return json(
		{ sent: result?.sent ?? 0, failed: result?.failed ?? 0 },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
