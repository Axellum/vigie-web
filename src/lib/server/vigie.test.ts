import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	VIGIE_API_URL: 'http://vigie-api.test',
	VIGIE_POINT_LOOKUPS_PER_DAY: '1',
	VIGIE_ME_POINT_LOOKUPS_PER_DAY: '2',
	VIGIE_TV_POINT_LOOKUPS_PER_DAY: '1'
}));

describe('weather point and TV budgets', () => {
	let fetches: string[];

	beforeEach(() => {
		vi.resetModules();
		fetches = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				const url = String(input);
				fetches.push(url);
				return new Response(
					JSON.stringify({
						coordinates: { lat: 43.65, lon: -1.45 },
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
	});

	it('isolates the /me account budget from anonymous /near lookups and reuses fresh marine/TV answers', async () => {
		const { BudgetError, getPoint, getTvPoint } = await import('./vigie');

		// Anonymous /near lookup spends the single anonymous budget slot (VIGIE_POINT_LOOKUPS_PER_DAY=1).
		await getPoint(43.66, -1.44, false);
		await expect(getPoint(48.85, 2.35, false)).rejects.toBeInstanceOf(BudgetError);

		// Signed-in /me lookup on another cell uses VIGIE_ME_POINT_LOOKUPS_PER_DAY=2 independently.
		await getPoint(47.22, -1.55, false, 'acct-1');
		expect(fetches).toHaveLength(2);

		// Different coordinate with marine=true populates `point:...:marine`, which getTvPoint reuses without
		// hitting the network or touching VIGIE_TV_POINT_LOOKUPS_PER_DAY.
		await getPoint(44.84, -0.58, true, 'acct-2');
		expect(fetches).toHaveLength(3);

		const tvReused = await getTvPoint(44.84, -0.58);
		expect(tvReused.value.current?.tempC).toBe(19);
		expect(fetches).toHaveLength(3);

		// /me pool is now empty (2 lookups used: acct-1 + acct-2).
		await expect(getPoint(45.76, 4.83, false, 'acct-3')).rejects.toBeInstanceOf(BudgetError);

		// Yet the TV budget (1) is still intact, and a subsequent marine getPoint reuses `tvpoint` from cache!
		await getTvPoint(43.48, -1.56);
		expect(fetches).toHaveLength(4);
		const meReused = await getPoint(43.48, -1.56, true, 'acct-3');
		expect(meReused.value.current?.tempC).toBe(19);
		expect(fetches).toHaveLength(4);
	});

	it('gives TV aurora estimates their own TV budget and reuses fresh place aurora cache', async () => {
		const { BudgetError, getAuroraPlace, getTvAurora } = await import('./vigie');

		// TV aurora spends TV budget (1); getAuroraPlace at the same cell reuses `tvaurora` with zero fetch.
		await getTvAurora(43.66, -1.44);
		expect(fetches).toHaveLength(1);
		await getAuroraPlace(43.66, -1.44);
		expect(fetches).toHaveLength(1);

		// TV budget is now exhausted for another cell, while public getAuroraPlace still has its own budget (1).
		await expect(getTvAurora(48.85, 2.35)).rejects.toBeInstanceOf(BudgetError);
		await getAuroraPlace(48.85, 2.35);
		expect(fetches).toHaveLength(2);
	});
});

describe('radar tile cache', () => {
	let fetches: string[];
	let status: number;

	beforeEach(() => {
		vi.resetModules();
		fetches = [];
		status = 200;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				fetches.push(String(input));
				return new Response(status === 200 ? new Uint8Array([137, 80, 78, 71]) : null, { status });
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('asks the API once for the same tile and again for another area, image or position', async () => {
		const { getRadarTile } = await import('./vigie');
		const a = await getRadarTile('france', 1000, 6, 33, 22);
		const b = await getRadarTile('france', 1000, 6, 33, 22);
		expect(Array.from(a ?? [])).toEqual([137, 80, 78, 71]);
		expect(b).toEqual(a);
		expect(fetches).toHaveLength(1);
		await getRadarTile('antilles', 1000, 6, 33, 22);
		await getRadarTile('france', 1300, 6, 33, 22);
		await getRadarTile('france', 1000, 6, 34, 22);
		expect(fetches).toHaveLength(4);
	});

	it('answers null for a tile the API does not list, and asks again after a short delay', async () => {
		vi.useFakeTimers();
		try {
			const { getRadarTile } = await import('./vigie');
			status = 404;
			expect(await getRadarTile('france', 1, 5, 1, 1)).toBeNull();
			expect(await getRadarTile('france', 1, 5, 1, 1)).toBeNull();
			expect(fetches).toHaveLength(1);
			vi.advanceTimersByTime(21_000);
			status = 200;
			expect(await getRadarTile('france', 1, 5, 1, 1)).not.toBeNull();
			expect(fetches).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not keep a failure as a tile', async () => {
		const { ApiError, getRadarTile } = await import('./vigie');
		status = 500;
		await expect(getRadarTile('france', 2, 5, 1, 1)).rejects.toBeInstanceOf(ApiError);
	});
});

describe('PIAF tile cache', () => {
	let fetches: string[];
	let immutable: boolean;
	let status: number;

	beforeEach(() => {
		vi.resetModules();
		fetches = [];
		immutable = true;
		status = 200;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				fetches.push(String(input));
				return new Response(status === 200 ? new Uint8Array([137, 80, 78, 71]) : null, {
					status,
					headers: { 'cache-control': immutable ? 'public, max-age=3600, immutable' : 'public, max-age=60' }
				});
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('asks the API once for a tile drawn with the run of its address', async () => {
		const { getRadarNowcastTile } = await import('./vigie');
		const a = await getRadarNowcastTile(1000, 6, 33, 22, 700);
		const b = await getRadarNowcastTile(1000, 6, 33, 22, 700);
		expect(a).toEqual({ tile: new Uint8Array([137, 80, 78, 71]), immutable: true });
		expect(b).toEqual(a);
		expect(fetches).toEqual(['http://vigie-api.test/v1/radar/france/nowcast/tiles/1000/6/33/22.png?run=700']);
		await getRadarNowcastTile(1000, 6, 33, 22, 1000);
		await getRadarNowcastTile(1000, 6, 33, 22, null);
		await getRadarNowcastTile(1300, 6, 33, 22, 700);
		expect(fetches).toHaveLength(4);
	});

	it('asks again for a tile drawn with another run than its address', async () => {
		const { getRadarNowcastTile } = await import('./vigie');
		immutable = false;
		expect((await getRadarNowcastTile(1000, 6, 33, 22, 700))?.immutable).toBe(false);
		await getRadarNowcastTile(1000, 6, 33, 22, 700);
		expect(fetches).toHaveLength(2);
	});

	it('answers null for a tile the API does not have, and asks again after a short delay', async () => {
		vi.useFakeTimers();
		try {
			const { getRadarNowcastTile } = await import('./vigie');
			status = 404;
			expect(await getRadarNowcastTile(1, 5, 1, 1, 1)).toBeNull();
			expect(await getRadarNowcastTile(1, 5, 1, 1, 1)).toBeNull();
			expect(fetches).toHaveLength(1);
			vi.advanceTimersByTime(21_000);
			status = 200;
			expect(await getRadarNowcastTile(1, 5, 1, 1, 1)).not.toBeNull();
			expect(fetches).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not keep a failure as a tile: asked again once the failure is forgotten', async () => {
		vi.useFakeTimers();
		try {
			const { ApiError, getRadarNowcastTile } = await import('./vigie');
			status = 500;
			await expect(getRadarNowcastTile(2, 5, 1, 1, 2)).rejects.toBeInstanceOf(ApiError);
			vi.advanceTimersByTime(16_000);
			status = 200;
			expect(await getRadarNowcastTile(2, 5, 1, 1, 2)).not.toBeNull();
			expect(fetches).toHaveLength(2);
		} finally {
			vi.useRealTimers();
		}
	});
});
