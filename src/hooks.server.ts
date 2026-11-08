import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { asLang, langFromHeader, type Lang } from '#lib/i18n.js';
import { LANG_COOKIE, setLangCookie } from '#lib/server/langCookie.js';
import { VIGIE_MATCH_INTERVAL_S } from '$app/env/private';
import { cleanUp } from '#lib/server/accounts.js';
import { accountsEnabled, db } from '#lib/server/db.js';
import { matchAndNotify } from '#lib/server/notify.js';
import { allow } from '#lib/server/ratelimit.js';
import { applySecurityHeaders } from '#lib/server/securityHeaders.js';
import { lowerCasePath } from '#lib/seo.js';

const CLEAN_UP_MS = 6 * 60 * 60 * 1000;

/** How often the zones are compared with the alerts in force (VIGIE_MATCH_INTERVAL_S, 120 s by default). */
function matchInterval(): number {
	const s = Number(VIGIE_MATCH_INTERVAL_S);
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

function chooseLang(event: Parameters<Handle>[0]['event']): Lang {
	// ?lang=xx sets the choice (and the cookie); then the cookie; then the browser's languages.
	const fromQuery = asLang(event.url.searchParams.get('lang'));
	if (fromQuery) {
		setLangCookie(event.cookies, fromQuery, event.url.protocol === 'https:');
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

	applySecurityHeaders(response.headers, event.url.protocol === 'https:', event.url.pathname);
	return response;
};
