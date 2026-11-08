import { describe, expect, it } from 'vitest';
import { MAX_BLOCKS, parseBlocks, type Block } from './pageConfig';
import { addBlock, moveBlock, removeBlock, resizeBlock, sameBlocks } from './pageEdit';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const list: Block[] = [
	{ id: 'aaaa', type: 'weather', place: A, size: 'm' },
	{ id: 'bbbb', type: 'tide', place: A, size: 's' },
	{ id: 'cccc', type: 'sky', place: B, size: 'l' }
];
const ids = (blocks: readonly Block[]) => blocks.map((b) => b.id);

describe('addBlock', () => {
	it('puts the new block last, with an id the validation accepts, and leaves the list as it was', () => {
		const next = addBlock(list, { type: 'air', place: B, size: 's' });
		expect(next).toHaveLength(4);
		expect(next?.slice(0, 3)).toEqual(list);
		expect(next?.[3]).toMatchObject({ type: 'air', place: B, size: 's' });
		expect(list).toHaveLength(3);
		expect(parseBlocks(next, new Set([A, B])).ok).toBe(true);
	});

	it('refuses a block when the page is full', () => {
		const full = Array.from({ length: MAX_BLOCKS }, (_, i) => ({
			id: `b${String(i).padStart(3, '0')}`,
			type: 'weather' as const,
			place: A,
			size: 'm' as const
		}));
		expect(addBlock(full, { type: 'air', place: A, size: 'm' })).toBeNull();
		expect(addBlock(full.slice(1), { type: 'air', place: A, size: 'm' }, 'zzzz')).toHaveLength(MAX_BLOCKS);
	});
});

describe('removeBlock, moveBlock, resizeBlock', () => {
	it('takes a block away and keeps the others in order', () => {
		expect(ids(removeBlock(list, 'bbbb'))).toEqual(['aaaa', 'cccc']);
		expect(ids(removeBlock(list, 'nope'))).toEqual(['aaaa', 'bbbb', 'cccc']);
	});

	it('moves a block one place, and not past either end', () => {
		expect(ids(moveBlock(list, 'bbbb', -1))).toEqual(['bbbb', 'aaaa', 'cccc']);
		expect(ids(moveBlock(list, 'bbbb', 1))).toEqual(['aaaa', 'cccc', 'bbbb']);
		expect(ids(moveBlock(list, 'aaaa', -1))).toEqual(['aaaa', 'bbbb', 'cccc']);
		expect(ids(moveBlock(list, 'cccc', 1))).toEqual(['aaaa', 'bbbb', 'cccc']);
		expect(ids(moveBlock(list, 'nope', 1))).toEqual(['aaaa', 'bbbb', 'cccc']);
	});

	it('changes the size of one block only', () => {
		const next = resizeBlock(list, 'bbbb', 'l');
		expect(next.map((b) => b.size)).toEqual(['m', 'l', 'l']);
		expect(list[1].size).toBe('s');
	});
});

describe('sameBlocks', () => {
	it('tells a page that changed from one that did not', () => {
		expect(sameBlocks(list, [...list])).toBe(true);
		expect(sameBlocks(list, moveBlock(list, 'bbbb', 1))).toBe(false);
		expect(sameBlocks(list, resizeBlock(list, 'aaaa', 's'))).toBe(false);
		expect(sameBlocks(list, removeBlock(list, 'cccc'))).toBe(false);
	});
});
