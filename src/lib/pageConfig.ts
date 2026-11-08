// The page of an account: a title and blocks in order. A block shows one card (src/lib/profiles.ts) of one saved
// place, in one of three sizes. This file validates what the browser sends, and nothing else: the database keeps
// the same limits (migration 006), so that a bug here cannot store a page the site cannot show.
import { cleanName } from './names';
import { CARDS, type Card } from './profiles';

export const MAX_BLOCKS = 24;
export const MAX_PAGES = 5;
export const BLOCK_SIZES = ['s', 'm', 'l'] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

export interface Block {
	/** Short and unique in the page: the key of the block when it moves. */
	id: string;
	type: Card;
	/** The id of a saved place of the same account. */
	place: string;
	size: BlockSize;
}

export type BlocksError = 'format' | 'too_many' | 'block' | 'duplicate' | 'place';

const BLOCK_ID = /^[a-z0-9]{4,12}$/;
const PLACE_ID = /^[0-9a-f-]{36}$/;

/** A new identifier for a block: 8 letters and digits. */
export function newBlockId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export function asSize(value: unknown): BlockSize | null {
	return typeof value === 'string' && (BLOCK_SIZES as readonly string[]).includes(value)
		? (value as BlockSize)
		: null;
}

/** Reads the blocks a browser sends (a list, or its JSON). The result holds the known fields only, so that nothing
 *  else is ever stored. Every block must show a card the site knows, of a place of the account (`places`). */
export function parseBlocks(
	value: unknown,
	places: ReadonlySet<string>
): { ok: true; blocks: Block[] } | { ok: false; error: BlocksError } {
	let list: unknown = value;
	if (typeof value === 'string') {
		if (value.length > 20_000) return { ok: false, error: 'format' };
		try {
			list = JSON.parse(value);
		} catch {
			return { ok: false, error: 'format' };
		}
	}
	if (!Array.isArray(list)) return { ok: false, error: 'format' };
	if (list.length > MAX_BLOCKS) return { ok: false, error: 'too_many' };
	const seen = new Set<string>();
	const blocks: Block[] = [];
	for (const raw of list) {
		if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'block' };
		const { id, type, place, size } = raw as Record<string, unknown>;
		const s = asSize(size);
		if (
			typeof id !== 'string' ||
			!BLOCK_ID.test(id) ||
			typeof type !== 'string' ||
			!(CARDS as readonly string[]).includes(type) ||
			typeof place !== 'string' ||
			!PLACE_ID.test(place) ||
			!s
		)
			return { ok: false, error: 'block' };
		if (seen.has(id)) return { ok: false, error: 'duplicate' };
		if (!places.has(place)) return { ok: false, error: 'place' };
		seen.add(id);
		blocks.push({ id, type: type as Card, place, size: s });
	}
	return { ok: true, blocks };
}

/** The blocks whose place still exists: a place removed takes its blocks with it. */
export function liveBlocks(blocks: readonly Block[], places: ReadonlySet<string>): Block[] {
	return blocks.filter((b) => places.has(b.place));
}

export function parseTitle(value: unknown): string | null {
	return cleanName(value, 60);
}
