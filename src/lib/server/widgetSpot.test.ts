import { describe, expect, it } from 'vitest';
import { within } from './widgetSpot';

const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const failAfter = (ms: number) =>
	new Promise<never>((_, reject) => setTimeout(() => reject(new Error('down')), ms));

describe('within', () => {
	it('gives the work when it ends in time', async () => {
		expect(await within(after(5, 'spot'), 200, 'late')).toBe('spot');
	});

	it('gives the fallback when the work is slower, and the work goes on', async () => {
		let done = false;
		const work = after(80, 'spot').then((v) => ((done = true), v));
		expect(await within(work, 10, 'late')).toBe('late');
		expect(done).toBe(false);
		expect(await work).toBe('spot');
	});

	it('passes on an error that comes in time', async () => {
		await expect(within(failAfter(5), 200, 'late')).rejects.toThrow('down');
	});

	it('drops an error that comes after the fallback, rather than leaving it unhandled', async () => {
		// Vitest fails the run on an unhandled rejection: this test would, without the guard in `within`.
		expect(await within(failAfter(30), 5, 'late')).toBe('late');
		await after(60, null);
	});
});
