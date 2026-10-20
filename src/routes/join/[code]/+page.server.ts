import { error } from '@sveltejs/kit';
import { readInvitation } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

// The page of an invitation link. The code stays in the address only: it is sent back with the passkey.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const invitation = await readInvitation(await db(), params.code);
	return {
		code: params.code,
		valid: invitation !== null,
		recoverName: invitation?.forUser?.name ?? null,
		expiresAt: invitation ? Math.floor(invitation.expiresAt.getTime() / 1000) : null
	};
};
