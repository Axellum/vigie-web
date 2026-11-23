import { describe, expect, it } from 'vitest';
import { TtlCache } from './cache';

function clock(start = 0) {
	let now = start;
	return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('TtlCache', () => {
	it('shares one request between concurrent callers', async () => {
		const c = clock();
		const cache = new TtlCache(c.now);
		let calls = 0;
		const load = async () => {
			calls++;
			return 42;
		};
		const results = await Promise.all(Array.from({ length: 50 }, () => cache.get('k', 1000, load)));
		expect(calls).toBe(1);
		expect(results.every((r) => r.value === 42 && !r.stale)).toBe(true);
	});

	it('asks again after the TTL', async () => {
		const c = clock();
		const cache = new TtlCache(c.now);
		let calls = 0;
		const load = async () => ++calls;
		await cache.get('k', 1000, load);
		c.advance(500);
		expect((await cache.get('k', 1000, load)).value).toBe(1);
		c.advance(600);
		expect((await cache.get('k', 1000, load)).value).toBe(2);
	});

	it('keeps a value for the time its own TTL gives: an absence is asked again sooner than the thing', async () => {
		const c = clock();
		const cache = new TtlCache(c.now);
		const answers: (string | null)[] = [null, 'image', 'other'];
		let calls = 0;
		const load = async () => answers[calls++];
		const ttl = (value: string | null) => (value ? 60_000 : 1000);
		expect((await cache.get('k', ttl, load)).value).toBeNull();
		c.advance(500);
		expect((await cache.get('k', ttl, load)).value).toBeNull();
		expect(calls).toBe(1);
		c.advance(600);
		expect((await cache.get('k', ttl, load)).value).toBe('image');
		c.advance(30_000);
		expect((await cache.get('k', ttl, load)).value).toBe('image');
		expect(calls).toBe(2);
	});

	it('serves the last good value, marked stale, when a refresh fails', async () => {
		const c = clock();
		const cache = new TtlCache(c.now, 15_000);
		await cache.get('k', 1000, async () => 'good');
		c.advance(2000);
		const failing = async (): Promise<string> => {
			throw new Error('down');
		};
		const r = await cache.get('k', 1000, failing);
		expect(r).toMatchObject({ value: 'good', stale: true });
		// Still stale, without asking again, during the error delay.
		let calls = 0;
		const r2 = await cache.get('k', 1000, async () => {
			calls++;
			return 'new';
		});
		expect(r2).toMatchObject({ value: 'good', stale: true });
		expect(calls).toBe(0);
	});

	it('remembers a failure with no fallback for a short while', async () => {
		const c = clock();
		const cache = new TtlCache(c.now, 15_000);
		let calls = 0;
		const failing = async (): Promise<number> => {
			calls++;
			throw new Error('down');
		};
		await expect(cache.get('k', 1000, failing)).rejects.toThrow('down');
		await expect(cache.get('k', 1000, failing)).rejects.toThrow('down');
		expect(calls).toBe(1);
		c.advance(16_000);
		await expect(cache.get('k', 1000, failing)).rejects.toThrow('down');
		expect(calls).toBe(2);
	});
});
