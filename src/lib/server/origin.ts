import { VIGIE_PUBLIC_ORIGIN } from '$app/env/private';

/** The public address of the site, used for canonical links, social previews and the sitemap. Set
 *  `VIGIE_PUBLIC_ORIGIN` for another address (a copy of the site); `ORIGIN` is not used because it is the
 *  address the Node server believes it is reached at, which is a local one in tests and checks. */
export const DEFAULT_PUBLIC_ORIGIN = 'https://vigie.auxfilsdesidees.fr';

export function publicOrigin(): string {
	const value = (VIGIE_PUBLIC_ORIGIN ?? '').trim().replace(/\/+$/, '');
	return /^https?:\/\/[^/\s]+$/.test(value) ? value : DEFAULT_PUBLIC_ORIGIN;
}
