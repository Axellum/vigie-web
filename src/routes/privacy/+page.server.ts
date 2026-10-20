import { error } from '@sveltejs/kit';
import { accountsEnabled } from '$lib/server/db';
import type { PageServerLoad } from './$types';

// The page describes the accounts: on a server without accounts, there is nothing to describe.
export const load: PageServerLoad = () => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
};
