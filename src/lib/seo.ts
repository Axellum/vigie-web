// What search engines are told about the site: the public pages worth indexing, as an XML sitemap.
// Pure functions (no network), so that they are tested on their own.

/** Public pages that do not depend on the data: the same for every visitor. */
export const STATIC_PATHS = [
	'/',
	'/near',
	'/countries',
	'/travel',
	'/sources',
	'/about',
	'/privacy'
] as const;

/** The page of each country the API serves official warnings for; codes that are not two letters are ignored. */
export function countryPaths(codes: string[]): string[] {
	const unique = new Set<string>();
	for (const code of codes) if (/^[A-Za-z]{2}$/.test(code)) unique.add(`/country/${code.toLowerCase()}`);
	return [...unique].sort();
}

/** The one address of a country, area or warning page when `pathname` spells it with capitals
 *  (`/country/FR`, `/travel/FR`, `/warning/DE/<id>`), so that each page has a single URL; `null` when it is already that one.
 *  A warning's id keeps its case: it is the issuer's. */
export function lowerCasePath(pathname: string): string | null {
	let normal = pathname;
	if (pathname.startsWith('/country/') || pathname.startsWith('/travel/')) normal = pathname.toLowerCase();
	else {
		const m = /^\/warning\/([^/]+)(\/.*)?$/.exec(pathname);
		if (m) normal = `/warning/${m[1].toLowerCase()}${m[2] ?? ''}`;
	}
	return normal === pathname ? null : normal;
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** A sitemap listing `paths` under `origin` (no trailing slash). No `lastmod`: the pages change with the
 *  data, and a date that is not known is not given. */
export function sitemapXml(origin: string, paths: string[]): string {
	const base = origin.replace(/\/+$/, '');
	const urls = [...new Set(paths)].map((p) => `\t<url><loc>${escapeXml(base + p)}</loc></url>`);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		'</urlset>',
		''
	].join('\n');
}
