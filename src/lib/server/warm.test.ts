import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	VIGIE_API_URL: 'http://vigie-api.test',
	VIGIE_POINT_LOOKUPS_PER_DAY: '1',
	VIGIE_WARM_LOOKUPS_PER_DAY: '3',
	VIGIE_WARM_PLACES: '',
	VIGIE_WARM_MAX_CELLS: ''
}));

import { maxCells, selectCells, warmEnabled, warmPass, WARM_REFRESH_MS, type Cell } from './warm';

describe('selectCells', () => {
	it('puts places of the same 0.05 degree cell together, and ignores what is not a position', () => {
		const cells = selectCells(
			[
				{ lat: 48.8566, lon: 2.3522 },
				{ lat: 48.8601, lon: 2.349 },
				{ lat: 48.9, lon: 2.35 },
				{ lat: Number.NaN, lon: 1 }
			],
			10
		);
		expect(cells).toEqual([
			{ lat: 48.85, lon: 2.35 },
			{ lat: 48.9, lon: 2.35 }
		]);
	});

	it('keeps the most followed cells first, at most max, and a stable order for equal counts', () => {
		const places: Cell[] = [
			{ lat: 10, lon: 10 },
			{ lat: 20, lon: 20 },
			{ lat: 20.01, lon: 20.01 },
			{ lat: 30, lon: 30 },
			{ lat: 5, lon: 5 }
		];
		expect(selectCells(places, 2)).toEqual([
			{ lat: 20, lon: 20 },
			{ lat: 5, lon: 5 }
		]);
		expect(selectCells(places, 0)).toEqual([]);
		expect(selectCells([], 5)).toEqual([]);
	});
});

describe('switch and bounds', () => {
	it('is off unless VIGIE_WARM_PLACES is 1 or true', () => {
		expect(warmEnabled(undefined)).toBe(false);
		expect(warmEnabled('')).toBe(false);
		expect(warmEnabled('0')).toBe(false);
		expect(warmEnabled('1')).toBe(true);
		expect(warmEnabled('true')).toBe(true);
	});

	it('reads the number of cells, 20 when it is missing or not a whole number, 0 turns it off', () => {
		expect(maxCells(undefined)).toBe(20);
		expect(maxCells('')).toBe(20);
		expect(maxCells('abc')).toBe(20);
		expect(maxCells('-3')).toBe(20);
		expect(maxCells('7')).toBe(7);
		expect(maxCells('0')).toBe(0);
	});
});

describe('warmPass', () => {
	const places = async () => [
		{ lat: 1, lon: 1 },
		{ lat: 2, lon: 2 },
		{ lat: 2.01, lon: 2.01 },
		{ lat: 3, lon: 3 }
	];
	const pause = vi.fn(async () => {});

	it('asks each distinct cell once, within the bound, a little before the answer expires', async () => {
		const warm = vi.fn(async (_lat: number, _lon: number, _maxAgeMs: number) => 'fetched' as const);
		const r = await warmPass({ places, warm, max: 2, pause });
		expect(r).toEqual({ cells: 2, fetched: 2, failed: 0, budget: false });
		expect(warm.mock.calls.map((c) => [c[0], c[1]])).toEqual([
			[2, 2],
			[1, 1]
		]);
		expect(warm.mock.calls[0][2]).toBe(WARM_REFRESH_MS);
		expect(WARM_REFRESH_MS).toBe(840_000);
	});

	it('skips a cell that is still fresh without a pause', async () => {
		pause.mockClear();
		const warm = vi.fn(async (_lat: number, _lon: number, _maxAgeMs: number) => 'fresh' as const);
		const r = await warmPass({ places, warm, max: 10, pause });
		expect(r).toMatchObject({ cells: 3, fetched: 0, failed: 0 });
		expect(pause).not.toHaveBeenCalled();
	});

	it('stops when the budget is used up, and goes on after a failure', async () => {
		const warm = vi.fn().mockRejectedValueOnce(new Error('API down')).mockResolvedValueOnce('budget');
		const r = await warmPass({ places, warm, max: 10, pause });
		expect(r).toEqual({ cells: 3, fetched: 0, failed: 1, budget: true });
		expect(warm).toHaveBeenCalledTimes(2);
	});
});

describe('warmPoint', () => {
	let fetches: string[];
	beforeEach(() => {
		vi.resetModules();
		fetches = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				fetches.push(String(input));
				return new Response(
					JSON.stringify({
						coordinates: { lat: 48.85, lon: 2.35 },
						utc_offset_s: 3600,
						current: { temp_c: 19 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			})
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('asks the API for the cell, then finds it fresh, and a visitor then reads it without a request', async () => {
		const { warmPoint, getPoint } = await import('./vigie');
		expect(await warmPoint(48.8566, 2.3522, WARM_REFRESH_MS)).toBe('fetched');
		expect(fetches).toHaveLength(1);
		expect(fetches[0]).toContain('/v1/point?lat=48.85&lon=2.35&marine=false');
		expect(await warmPoint(48.86, 2.34, WARM_REFRESH_MS)).toBe('fresh');
		// The visitor's budget (1 a day here) is untouched: the same cell is served from the entry the warming made.
		expect((await getPoint(48.86, 2.34, false)).value).toBeTruthy();
		expect(fetches).toHaveLength(1);
	});

	it('asks again once the answer is older than the delay', async () => {
		vi.useFakeTimers();
		const { warmPoint } = await import('./vigie');
		await warmPoint(10, 10, WARM_REFRESH_MS);
		vi.advanceTimersByTime(WARM_REFRESH_MS - 1000);
		expect(await warmPoint(10, 10, WARM_REFRESH_MS)).toBe('fresh');
		vi.advanceTimersByTime(2000);
		expect(await warmPoint(10, 10, WARM_REFRESH_MS)).toBe('fetched');
		expect(fetches).toHaveLength(2);
	});

	it('has a budget of its own: it stops at its limit and does not touch the visitors', async () => {
		const { warmPoint, getPoint } = await import('./vigie');
		expect(await warmPoint(1, 1, 0)).toBe('fetched');
		expect(await warmPoint(2, 2, 0)).toBe('fetched');
		expect(await warmPoint(3, 3, 0)).toBe('fetched');
		expect(await warmPoint(4, 4, 0)).toBe('budget');
		expect(fetches).toHaveLength(3);
		// VIGIE_POINT_LOOKUPS_PER_DAY is 1: the visitor's single lookup is still there.
		await expect(getPoint(50, 5, false)).resolves.toBeTruthy();
	});
});
