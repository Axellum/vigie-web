import { error, redirect } from '@sveltejs/kit';
import { sessionUser } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { signupStatus } from '#lib/server/signup.js';
import { signupSettings } from '#lib/server/signupEnv.js';
import type { PageServerLoad } from './$types';

// Opening an account without an invitation: the form when the site is open, the reason when it is not.
export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders({ 'cache-control': 'private, no-store' });
	const sql = await db();
	if (await sessionUser(sql, cookies, url.protocol === 'https:')) redirect(303, '/account');
	return { status: await signupStatus(sql, signupSettings()) };
};
