import type { Handle } from '@sveltejs/kit';
import { asLang, langFromHeader, type Lang } from '$lib/i18n';
import { allow } from '$lib/server/ratelimit';

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
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	if (event.url.protocol === 'https:') {
		response.headers.set('strict-transport-security', 'max-age=31536000');
	}
	// The page depends on the language: a shared cache must keep one copy per language.
	if (!response.headers.has('vary')) response.headers.set('vary', 'Accept-Language, Cookie');
	return response;
};
