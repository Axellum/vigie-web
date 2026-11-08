// What a person does to the blocks of their page: add one, take one away, move it up or down, change its size. Pure
// functions on a list that is never changed in place, so that the page can keep the old list until "Done" saves the
// new one, and so that each gesture is tested without a browser.
import { type Block, type BlockSize, MAX_BLOCKS, newBlockId } from './pageConfig';
import type { Card } from './profiles';

/** The list with a new block at the end; null when the page already holds as many as it can. */
export function addBlock(
	blocks: readonly Block[],
	add: { type: Card; place: string; size: BlockSize },
	id: string = newBlockId()
): Block[] | null {
	if (blocks.length >= MAX_BLOCKS) return null;
	return [...blocks, { id, ...add }];
}

export function removeBlock(blocks: readonly Block[], id: string): Block[] {
	return blocks.filter((b) => b.id !== id);
}

/** The block one place up (-1) or down (+1); the list as it was when the block is not there or already at the end. */
export function moveBlock(blocks: readonly Block[], id: string, step: -1 | 1): Block[] {
	const from = blocks.findIndex((b) => b.id === id);
	const to = from + step;
	if (from < 0 || to < 0 || to >= blocks.length) return [...blocks];
	const next = [...blocks];
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}

export function resizeBlock(blocks: readonly Block[], id: string, size: BlockSize): Block[] {
	return blocks.map((b) => (b.id === id ? { ...b, size } : b));
}

/** Whether two lists are the same page: the order, the cards, the places and the sizes (the ids follow). */
export function sameBlocks(a: readonly Block[], b: readonly Block[]): boolean {
	return (
		a.length === b.length &&
		a.every(
			(x, i) => x.id === b[i].id && x.type === b[i].type && x.place === b[i].place && x.size === b[i].size
		)
	);
}
