import { error, json } from '@sveltejs/kit';
import { exportUser, sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import type { RequestHandler } from './$types';

// Everything the site keeps about the person signed in, as a file.
export const GET: RequestHandler = async ({ cookies, url }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) error(401, 'Not signed in');
	return json(await exportUser(sql, user.id), {
		headers: {
			'cache-control': 'no-store',
			'content-disposition': 'attachment; filename="vigie-account.json"'
		}
	});
};
