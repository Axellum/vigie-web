import { error, fail, redirect } from '@sveltejs/kit';
import { accountsEnabled, db } from '#lib/server/db.js';
import { useRecoveryCode } from '#lib/server/recovery.js';
import { recoveryTries } from '#lib/server/signup.js';
import type { Actions, PageServerLoad } from './$types';

// A recovery code turns into a 30-minute invitation to add a passkey to its account: /join/<code> does the rest.
// A wrong code, a used one and a badly written one get the same answer.
export const load: PageServerLoad = ({ setHeaders }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	setHeaders({ 'cache-control': 'private, no-store' });
	return {};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
		if (!recoveryTries.take(getClientAddress())) return fail(429, { error: 'recover.slow' });
		const code = (await request.formData()).get('code');
		const invitation = await useRecoveryCode(await db(), code);
		if (!invitation) return fail(400, { error: 'recover.wrong' });
		redirect(303, `/join/${invitation}`);
	}
};
