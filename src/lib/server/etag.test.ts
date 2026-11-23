import { describe, expect, it } from 'vitest';
import { etagMatches } from './etag';

describe('etagMatches', () => {
	const tag = 'W/"hz-1000"';
	it('matches the same tag, weak or strong, in a list or as *', () => {
		expect(etagMatches('W/"hz-1000"', tag)).toBe(true);
		expect(etagMatches('"hz-1000"', tag)).toBe(true);
		expect(etagMatches('W/"hz-1", W/"hz-1000"', tag)).toBe(true);
		expect(etagMatches('*', tag)).toBe(true);
	});
	it('does not match another tag or no header', () => {
		expect(etagMatches('W/"hz-999"', tag)).toBe(false);
		expect(etagMatches('W/"hz-1000-stale"', tag)).toBe(false);
		expect(etagMatches(null, tag)).toBe(false);
		expect(etagMatches('', tag)).toBe(false);
	});
});
