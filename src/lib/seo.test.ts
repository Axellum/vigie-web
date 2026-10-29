import { describe, expect, it } from 'vitest';
import { countryPaths, lowerCasePath, sitemapXml, STATIC_PATHS } from './seo';

const ORIGIN = 'https://vigie.example.org';

describe('countryPaths', () => {
	it('gives one lower-case page per country, sorted, without duplicates or bad codes', () => {
		expect(countryPaths(['FR', 'BE', 'fr', 'X', 'FRA', '../a'])).toEqual(['/country/be', '/country/fr']);
	});
});

describe('lowerCasePath', () => {
	it('lowers a country or area page spelled with capitals', () => {
		expect(lowerCasePath('/country/FR')).toBe('/country/fr');
		expect(lowerCasePath('/travel/UG')).toBe('/travel/ug');
		expect(lowerCasePath('/country/fr/FINISTERE')).toBe('/country/fr/finistere');
	});

	it("lowers a warning's country but keeps the issuer's id", () => {
		expect(lowerCasePath('/warning/DE/2.49.0.0.276.0.DWD.PVW~MUL')).toBe(
			'/warning/de/2.49.0.0.276.0.DWD.PVW~MUL'
		);
		expect(lowerCasePath('/warning/de/2.49.0.0.276.0.DWD.PVW~MUL')).toBeNull();
	});

	it('leaves other pages and addresses already in lower case alone', () => {
		for (const p of ['/country/fr', '/country/fr/finistere', '/About', '/alert/ABC', '/', '/warning'])
			expect(lowerCasePath(p)).toBeNull();
	});
});

describe('sitemapXml', () => {
	const xml = sitemapXml(`${ORIGIN}/`, [...STATIC_PATHS, ...countryPaths(['FR', 'DE'])]);
	const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

	it('is a urlset in the sitemap namespace, with a prolog', () => {
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns=')).toBe(true);
		expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
		expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
	});

	it('lists absolute, unique URLs under the origin, with no double slash', () => {
		expect(locs.length).toBe(STATIC_PATHS.length + 2);
		expect(new Set(locs).size).toBe(locs.length);
		for (const loc of locs) {
			expect(loc.startsWith(`${ORIGIN}/`)).toBe(true);
			expect(loc.slice(ORIGIN.length)).not.toContain('//');
		}
		expect(locs).toContain(`${ORIGIN}/`);
		expect(locs).toContain(`${ORIGIN}/country/fr`);
	});

	it('lists no private or short-lived page, and invents no date', () => {
		for (const loc of locs) {
			expect(loc).not.toMatch(/\/(account|login|join|data|alert|warning)(\/|$)/);
		}
		expect(xml).not.toContain('lastmod');
	});

	it('escapes what XML reserves and drops repeated paths', () => {
		const odd = sitemapXml(ORIGIN, ['/a&b', '/a&b']);
		expect(odd).toContain('<loc>https://vigie.example.org/a&amp;b</loc>');
		expect(odd.match(/<url>/g)).toHaveLength(1);
	});
});
