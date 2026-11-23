import { error, json } from '@sveltejs/kit';
import { pollAppLink } from '#lib/server/appLinks.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { fcmEnabled } from '#lib/server/fcm.js';
import type { RequestHandler } from './$types';

// The app asks where its code stands: JSON `{ wait, code }`. `pending` while nobody entered it, `expired` once it
// is gone, `ready` with the app's secret once (the code is then forgotten).
const NO_STORE = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };

export const POST: RequestHandler = async ({ request }) => {
	if (!accountsEnabled() || !fcmEnabled()) error(404, 'The app’s notifications are not open on this server');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	return json(await pollAppLink(await db(), body?.wait, body?.code), { headers: NO_STORE });
};
