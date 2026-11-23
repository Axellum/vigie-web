import { describe, expect, it } from 'vitest';

// notify.ts reads the site's cache and the database layer; mapLimit is the only part under test here.
import { mapLimit } from './notify';

describe('mapLimit', () => {
	it('keeps the order of the items and never runs more than the limit at once', async () => {
		let running = 0;
		let peak = 0;
		const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((r) => setTimeout(r, n));
			running--;
			return n * 2;
		});
		expect(out).toEqual([10, 2, 8, 4, 6, 12, 14]);
		expect(peak).toBe(3);
	});

	it('handles an empty list and a limit above the count', async () => {
		expect(await mapLimit([], 4, async (n: number) => n)).toEqual([]);
		expect(await mapLimit([1, 2], 4, async (n) => n + 1)).toEqual([2, 3]);
	});
});
