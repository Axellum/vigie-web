import type { Handle, ServerInit } from '@sveltejs/kit';
import { asLang, langFromHeader, type Lang } from '$lib/i18n';
import { env } from '$env/dynamic/private';
import { cleanUp } from '$lib/server/accounts';
import { accountsEnabled, db } from '$lib/server/db';
import { matchAndNotify } from '$lib/server/notify';
import { allow } from '$lib/server/ratelimit';
import { lowerCasePath } from '$lib/seo';

const CLEAN_UP_MS = 6 * 60 * 60 * 1000;

/** How often the zones are compared with the alerts in force (VIGIE_MATCH_INTERVAL_S, 120 s by default). */
function matchInterval(): number {
	const s = Number(env.VIGIE_MATCH_INTERVAL_S);
	return (Number.isFinite(s) && s >= 5 ? s : 120) * 1000;
}

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

	// The zones of the accounts against the alerts in force: one run at a time.
	let matching = false;
	const match = async () => {
		if (matching) return;
		matching = true;
		try {
			const done = await matchAndNotify(await db());
			if (done.matched)
				console.log(`notify: ${done.matched} new match(es), ${done.sent} notification(s) sent`);
		} catch (e) {
			console.error(`notify: run failed (${(e as Error).message})`);
		} finally {
			matching = false;
		}
	};
	setInterval(match, matchInterval()).unref();
	setTimeout(match, 5_000).unref();
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

	// One address per page: /country/FR is a copy of /country/fr for a search engine.
	const lower = lowerCasePath(event.url.pathname);
	if (lower) {
		return new Response(null, { status: 301, headers: { location: lower + event.url.search } });
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
