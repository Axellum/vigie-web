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
