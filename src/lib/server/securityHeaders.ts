// The headers every response of the site carries (src/hooks.server.ts), chosen by the site and not by the page: a
// page that asks for another value is overwritten, as it always has been. The one exception made here is on purpose
// and by address: the private link of a page, whose address holds a secret.

/** The policy of the site: the origin only, and only to another site. */
const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * Addresses that hold a secret: the private link of a page (`/tv/p/<secret>`). They send no referrer at all, not even
 * to this site: the requests such a page makes for its data would carry the address in `Referer`, and an access log
 * (the Deck's Caddy keeps one) would keep the secret with it. They are not cached and not indexed either, whatever the
 * route says.
 */
const SECRET_PATH = /^\/tv\/p\//;

/** Whether this address holds a secret. */
export const isSecretPath = (pathname: string): boolean => SECRET_PATH.test(pathname);

/**
 * Sets the headers of the site on the headers of a response. `pathname` is the address asked for.
 *
 * Only an address that holds a secret gets another referrer policy. Honouring the policy any page asks for was tried
 * and breaks the site: `/join/<code>` asks for `no-referrer`, and a document that began there then posts its forms
 * with `Origin: null`, which the framework refuses as cross-site ("Cross-site POST form submissions are forbidden",
 * seen in the end-to-end test that deletes an account).
 */
export function applySecurityHeaders(headers: Headers, https: boolean, pathname = '/'): void {
	const secret = isSecretPath(pathname);
	headers.set('x-content-type-options', 'nosniff');
	headers.set('referrer-policy', secret ? 'no-referrer' : REFERRER_POLICY);
	headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(self), interest-cohort=()');
	// Browsers ignore these two on plain HTTP (the home network address), so they are only sent on HTTPS.
	if (https) {
		headers.set('cross-origin-opener-policy', 'same-origin');
		headers.set('strict-transport-security', 'max-age=31536000');
	}
	if (secret) {
		headers.set('cache-control', 'private, no-store');
		headers.set('x-robots-tag', 'noindex, nofollow');
	}
	// The page depends on the language: a shared cache must keep one copy per language.
	if (!headers.has('vary')) headers.set('vary', 'Accept-Language, Cookie');
}
