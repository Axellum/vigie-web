import { error, redirect } from '@sveltejs/kit';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { listZones } from '#lib/server/zones.js';
import type { PageServerLoad } from './$types';

// One zone of the account, on a map (a drawn zone has no public page to show it).
export const load: PageServerLoad = async ({ cookies, url, params, setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders({ 'cache-control': 'private, no-store' });
	const sql = await db();
	const user = await sessionUser(sql, cookies, url.protocol === 'https:');
	if (!user) redirect(303, '/login');
	const zone = (await listZones(sql, user.id)).find((z) => z.id === params.id);
	if (!zone) error(404, 'No such zone');
	return { zone };
};
