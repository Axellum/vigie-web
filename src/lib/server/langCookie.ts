// The language of the visit is a cookie the page can read too (so that a static page can follow it). It is set by
// `?lang=xx` on any address, and by the settings of an account.
import type { Cookies } from '@sveltejs/kit';
import type { Lang } from '#lib/i18n.js';

export const LANG_COOKIE = 'vigie-lang';

export function setLangCookie(cookies: Cookies, lang: Lang, secure: boolean): void {
	cookies.set(LANG_COOKIE, lang, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'lax',
		secure
	});
}
