// Keeps the weather of the places the server knows warm, so that the first opening of a known place is quick: the site holds the
// answer for the next visitor, and so does the API (the Android app reads the API's own cache of the same grid cell).
//
// Which places: the circles that accounts and the app's devices follow (`zones`, the bells and the linked app) and the places an
// account keeps (`places`). Several of them in the same cell of the weather grid (0.05°, `snapToGrid`) are one cell. At most
// `VIGIE_WARM_MAX_CELLS` cells, the most followed first. Each cell is asked again just before the site's answer expires (900 s),
// one at a time, from a budget of its own (`vigie.ts`, `VIGIE_WARM_LOOKUPS_PER_DAY`). Off unless `VIGIE_WARM_PLACES=1`.
// No position is written in a log: only counts.
import { VIGIE_WARM_MAX_CELLS, VIGIE_WARM_PLACES } from '$app/env/private';
import { snapToGrid } from '#lib/near.js';
import type { Query } from './db';
import { TTL_S, warmPoint, type WarmResult } from './vigie';

/** A cell is asked again when the site's answer is this old: a minute before it expires. */
export const WARM_REFRESH_MS = (TTL_S.point - 60) * 1000;
/** The pause between two cells of a pass, so that a pass is not a burst. */
export const WARM_GAP_MS = 250;
export const WARM_MAX_CELLS_DEFAULT = 20;
/** How often the cells are looked at (a cell is asked only when its answer is old enough). */
const TICK_MS = 60_000;

export interface Cell {
	lat: number;
	lon: number;
}

export function warmEnabled(raw: string | undefined = VIGIE_WARM_PLACES): boolean {
	return raw === '1' || raw === 'true';
}

export function maxCells(raw: string | undefined = VIGIE_WARM_MAX_CELLS): number {
	const n = Number(raw);
	return raw && Number.isInteger(n) && n >= 0 ? n : WARM_MAX_CELLS_DEFAULT;
}

/** The distinct grid cells of some positions, the most followed first (then by position, so that the choice is stable), at most `max`. */
export function selectCells(places: readonly Cell[], max: number): Cell[] {
	const count = new Map<string, { cell: Cell; n: number }>();
	for (const p of places) {
		if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
		const cell = snapToGrid({ lat: p.lat, lon: p.lon });
		const key = `${cell.lat},${cell.lon}`;
		const seen = count.get(key);
		if (seen) seen.n++;
		else count.set(key, { cell, n: 1 });
	}
	return [...count.values()]
		.sort((a, b) => b.n - a.n || a.cell.lat - b.cell.lat || a.cell.lon - b.cell.lon)
		.slice(0, Math.max(0, max))
		.map((c) => c.cell);
}

/** The positions the server knows: circle zones (accounts and app devices) and the places of accounts. */
export async function knownPlaces(sql: Query): Promise<Cell[]> {
	return sql<Cell[]>`
		select lat, lon from zones where kind = 'circle' and lat is not null and lon is not null
		union all
		select lat, lon from places
		limit 100000`;
}

export interface PassDeps {
	places: () => Promise<Cell[]>;
	warm: (lat: number, lon: number, maxAgeMs: number) => Promise<WarmResult>;
	max: number;
	pause: (ms: number) => Promise<void>;
}

export interface PassResult {
	cells: number;
	fetched: number;
	failed: number;
	/** True when the budget stopped the pass. */
	budget: boolean;
}

/** One pass over the cells: each is asked only if its answer is old enough; a failure does not stop the others, the budget does. */
export async function warmPass(deps: PassDeps): Promise<PassResult> {
	const cells = selectCells(await deps.places(), deps.max);
	const result: PassResult = { cells: cells.length, fetched: 0, failed: 0, budget: false };
	for (const cell of cells) {
		try {
			const done = await deps.warm(cell.lat, cell.lon, WARM_REFRESH_MS);
			if (done === 'budget') {
				result.budget = true;
				break;
			}
			if (done === 'fetched') {
				result.fetched++;
				await deps.pause(WARM_GAP_MS);
			}
		} catch {
			result.failed++;
		}
	}
	return result;
}

/** Start the loop when it is switched on: a pass every minute, one at a time. Returns false when it is off. */
export function startWarming(sql: () => Promise<Query>): boolean {
	if (!warmEnabled()) return false;
	const max = maxCells();
	if (max === 0) return false;
	let running = false;
	const tick = async () => {
		if (running) return;
		running = true;
		try {
			const r = await warmPass({
				places: async () => knownPlaces(await sql()),
				warm: warmPoint,
				max,
				pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
			});
			if (r.fetched || r.failed || r.budget)
				console.log(
					`warm: ${r.fetched} of ${r.cells} cell(s) asked, ${r.failed} failed${r.budget ? ', budget used up' : ''}`
				);
		} catch (e) {
			console.error(`warm: pass failed (${(e as Error).message})`);
		} finally {
			running = false;
		}
	};
	setInterval(tick, TICK_MS).unref();
	setTimeout(tick, 20_000).unref();
	return true;
}
