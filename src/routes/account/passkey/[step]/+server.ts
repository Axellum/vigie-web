import { error, json } from '@sveltejs/kit';
import { cleanName, isCode, openSession, sessionUser } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import {
	authenticate,
	authenticationOptions,
	PasskeyError,
	register,
	registrationOptions
} from '$lib/server/passkeys';
import type { RequestHandler } from './$types';

// The four steps of the passkey ceremonies, called by the page's script (JSON, same origin only).
export const POST: RequestHandler = async ({ params, request, url, cookies, locals }) => {
	if (!accountsEnabled()) error(404, 'Accounts are not open on this server');
	// Form posts are checked by SvelteKit; JSON calls are checked here.
	if (request.headers.get('origin') !== url.origin) error(403, 'Cross-site request');
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body expected');
	const secure = url.protocol === 'https:';
	const sql = await db();
	const noStore = { 'cache-control': 'no-store' };
	try {
		switch (params.step) {
			case 'register-options': {
				const code = body.code === undefined ? undefined : isCode(body.code) ? body.code : '';
				const name = body.name === undefined ? null : cleanName(body.name);
				const user = code === undefined ? await sessionUser(sql, cookies, secure) : null;
				return json(await registrationOptions(sql, url, { code, name, lang: locals.lang, user }), {
					headers: noStore
				});
			}
			case 'register': {
				const user = await sessionUser(sql, cookies, secure);
				const userId = await register(sql, url, body.id, body.response as never, user);
				if (user?.id !== userId) await openSession(sql, userId, cookies, secure);
				return json({ ok: true }, { headers: noStore });
			}
			case 'login-options':
				return json(await authenticationOptions(sql, url), { headers: noStore });
			case 'login': {
				const userId = await authenticate(sql, url, body.id, body.response as never);
				await openSession(sql, userId, cookies, secure);
				return json({ ok: true }, { headers: noStore });
			}
			default:
				error(404, 'Unknown step');
		}
	} catch (e) {
		if (e instanceof PasskeyError) return json({ error: e.code }, { status: 400, headers: noStore });
		throw e;
	}
};
