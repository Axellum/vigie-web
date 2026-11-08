import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS, parseBlocks } from './pageConfig';
import { starterBlocks, STARTER_CARDS } from './pageStarter';
import { cardOrder } from './profiles';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('starterBlocks', () => {
	it('gives each place the first cards of its profile, in the medium size, in the order of the places', () => {
		const blocks = starterBlocks([
			{ id: id(1), profile: 'surf' },
			{ id: id(2), profile: null }
		]);
		expect(blocks).toHaveLength(2 * STARTER_CARDS);
		expect(blocks.slice(0, STARTER_CARDS).map((b) => b.type)).toEqual(
			cardOrder('surf', false).slice(0, STARTER_CARDS)
		);
		expect(blocks.slice(STARTER_CARDS).map((b) => b.type)).toEqual(
			cardOrder(null, false).slice(0, STARTER_CARDS)
		);
		expect(blocks.every((b) => b.size === 'm')).toBe(true);
		expect(blocks.map((b) => b.place)).toEqual([...Array(3).fill(id(1)), ...Array(3).fill(id(2))]);
	});

	it('makes blocks the validation accepts, with ids that differ', () => {
		const places = [{ id: id(1), profile: 'sky' as const }];
		const blocks = starterBlocks(places);
		expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
		expect(parseBlocks(blocks, new Set([id(1)]))).toEqual({ ok: true, blocks });
	});

	it('never goes past what a page holds, and an account without a place starts empty', () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ id: id(i), profile: null }));
		expect(starterBlocks(many)).toHaveLength(MAX_BLOCKS);
		expect(starterBlocks([])).toEqual([]);
	});
});
