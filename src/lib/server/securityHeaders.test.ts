import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, isSecretPath } from './securityHeaders';

describe('the headers of the site', () => {
	it('sets the policy of the site on a response that says nothing', () => {
		const h = new Headers();
		applySecurityHeaders(h, false, '/near');
		expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(h.get('x-content-type-options')).toBe('nosniff');
		expect(h.get('permissions-policy')).toContain('geolocation=(self)');
		expect(h.get('vary')).toBe('Accept-Language, Cookie');
		// Plain HTTP (the home network address): the two headers browsers would ignore are not sent.
		expect(h.has('strict-transport-security')).toBe(false);
		expect(h.has('cross-origin-opener-policy')).toBe(false);
		// An ordinary page is not told to stay out of caches or search engines by the site.
		expect(h.has('cache-control')).toBe(false);
		expect(h.has('x-robots-tag')).toBe(false);
	});

	it('still overwrites the referrer policy an ordinary page asked for (as it always did)', () => {
		const h = new Headers({ 'referrer-policy': 'no-referrer' });
		applySecurityHeaders(h, true, '/join/abc');
		expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
	});

	it('sends no referrer, no cache and no index for an address that holds a secret', () => {
		const h = new Headers({ 'cache-control': 'public, max-age=60' });
		applySecurityHeaders(h, false, '/tv/p/AbCdEf');
		expect(h.get('referrer-policy')).toBe('no-referrer');
		expect(h.get('cache-control')).toBe('private, no-store');
		expect(h.get('x-robots-tag')).toBe('noindex, nofollow');
	});

	it('knows which addresses hold a secret, and only those', () => {
		expect(isSecretPath('/tv/p/AbCdEf')).toBe(true);
		expect(isSecretPath('/tv/p/')).toBe(true);
		for (const p of ['/', '/tv', '/tv/', '/tv/phone', '/near', '/me', '/join/abc', '/x/tv/p/abc'])
			expect(isSecretPath(p)).toBe(false);
	});

	it('keeps the vary a page set, and adds the HTTPS headers only on HTTPS', () => {
		const h = new Headers({ vary: 'Accept-Language' });
		applySecurityHeaders(h, true, '/');
		expect(h.get('vary')).toBe('Accept-Language');
		expect(h.get('strict-transport-security')).toBe('max-age=31536000');
		expect(h.get('cross-origin-opener-policy')).toBe('same-origin');
	});
});
