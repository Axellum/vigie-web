import type { Handle, ServerInit } from '@sveltejs/kit';
import { asLang, langFromHeader, type Lang } from '$lib/i18n';
import { cleanUp } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import { allow } from '$lib/server/ratelimit';

const CLEAN_UP_MS = 6 * 60 * 60 * 1000;

// With accounts, the database is migrated at start, and what has expired is removed every 6 hours. A database
// that does not answer does not stop the public site: the account pages fail until it answers.
export const init: ServerInit = async () => {
	if (!accountsEnabled()) return;
	const run = () =>
		db()
			.then(cleanUp)
			.catch((e) => console.error(`accounts: database not ready (${(e as Error).message})`));
	await run();
	setInterval(run, CLEAN_UP_MS).unref();
};

const LANG_COOKIE = 'vigie-lang';

function chooseLang(event: Parameters<Handle>[0]['event']): Lang {
	// ?lang=xx sets the choice (and the cookie); then the cookie; then the browser's languages.
	const fromQuery = asLang(event.url.searchParams.get('lang'));
	if (fromQuery) {
		event.cookies.set(LANG_COOKIE, fromQuery, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: false,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:'
		});
		return fromQuery;
	}
	return (
		asLang(event.cookies.get(LANG_COOKIE)) ?? langFromHeader(event.request.headers.get('accept-language'))
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!allow(event.getClientAddress(), event.url.pathname)) {
		return new Response('Too many requests. Try again in a minute.', {
			status: 429,
			headers: { 'retry-after': '60', 'content-type': 'text/plain; charset=utf-8' }
		});
	}

	const lang = chooseLang(event);
	event.locals.lang = lang;

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%vigie.lang%', lang)
	});

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'permissions-policy',
		'camera=(), microphone=(), geolocation=(self), interest-cohort=()'
	);
	// Browsers ignore these two on plain HTTP (the home network address), so they are only sent on HTTPS.
	if (event.url.protocol === 'https:') {
		response.headers.set('cross-origin-opener-policy', 'same-origin');
		response.headers.set('strict-transport-security', 'max-age=31536000');
	}
	// The page depends on the language: a shared cache must keep one copy per language.
	if (!response.headers.has('vary')) response.headers.set('vary', 'Accept-Language, Cookie');
	return response;
};
