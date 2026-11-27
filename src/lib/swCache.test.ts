import { describe, expect, it } from 'vitest';
import { fromKeptCopy, isDataImage, MAX_IMAGES, trimCache } from './swCache';

/** A cache as the Cache API keeps one: its entries in the order they were put, a put again going last. */
class FakeCache {
	entries: string[] = [];
	async put(url: string) {
		this.entries = this.entries.filter((u) => u !== url);
		this.entries.push(url);
	}
	async keys() {
		return this.entries.map((url) => new Request(url));
	}
	async delete(request: Request) {
		const before = this.entries.length;
		this.entries = this.entries.filter((u) => u !== request.url);
		return this.entries.length < before;
	}
}

const tile = (n: number) => `https://vigie.test/data/radar/${n}/6/33/22.png`;

describe('the images of the service worker', () => {
	it('are the images of the data only', () => {
		expect(isDataImage('/data/radar/1/6/33/22.png', 'image/png')).toBe(true);
		expect(isDataImage('/data/hazards.json', 'application/json')).toBe(false);
		expect(isDataImage('/icon-192.png', 'image/png')).toBe(false);
		expect(isDataImage('/data/radar/1/6/33/22.png', null)).toBe(false);
	});

	it('keep the last ones put, the oldest going first', async () => {
		const cache = new FakeCache();
		for (let n = 0; n < 5; n++) await cache.put(tile(n));
		await cache.put(tile(0));
		expect(await trimCache(cache, 3)).toBe(2);
		expect(cache.entries).toEqual([tile(3), tile(4), tile(0)]);
		expect(await trimCache(cache, 3)).toBe(0);
	});

	it('stay bounded however long a page stays open', async () => {
		const cache = new FakeCache();
		for (let n = 0; n < MAX_IMAGES * 3; n++) {
			await cache.put(tile(n));
			await trimCache(cache, MAX_IMAGES);
		}
		expect(cache.entries).toHaveLength(MAX_IMAGES);
		expect(cache.entries.at(-1)).toBe(tile(MAX_IMAGES * 3 - 1));
	});
});

describe('the files of the site kept by the service worker', () => {
	const assets = ['/ha-card/vigie-card.js', '/_app/immutable/entry/start.js', '/icon-192.png'];
	const at = (path: string) => new URL(path, 'https://vigie.example');

	it('are answered from the copy kept when asked for by their bare path', () => {
		expect(fromKeptCopy(at('/ha-card/vigie-card.js'), assets)).toBe(true);
		expect(fromKeptCopy(at('/_app/immutable/entry/start.js'), assets)).toBe(true);
	});

	it('come from the network when asked for in a given version: the copy kept may be the previous one', () => {
		expect(fromKeptCopy(at('/ha-card/vigie-card.js?v=71e4b9108bad'), assets)).toBe(false);
	});

	it('are only the files of the site', () => {
		expect(fromKeptCopy(at('/widget'), assets)).toBe(false);
		expect(fromKeptCopy(at('/data/card.json'), assets)).toBe(false);
	});
});
