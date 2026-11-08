import { describe, expect, it } from 'vitest';
import { liveBlocks, MAX_BLOCKS, newBlockId, parseBlocks, parseTitle } from './pageConfig';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const places = new Set([A, B]);
const block = (over: Record<string, unknown> = {}) => ({
	id: 'ab12',
	type: 'weather',
	place: A,
	size: 'm',
	...over
});

describe('parseBlocks', () => {
	it('reads a list, or its JSON, and keeps the known fields only', () => {
		const list = [block(), block({ id: 'cd34', type: 'tide', place: B, size: 'l', extra: 'dropped' })];
		const expected = [
			{ id: 'ab12', type: 'weather', place: A, size: 'm' },
			{ id: 'cd34', type: 'tide', place: B, size: 'l' }
		];
		expect(parseBlocks(list, places)).toEqual({ ok: true, blocks: expected });
		expect(parseBlocks(JSON.stringify(list), places)).toEqual({ ok: true, blocks: expected });
		expect(parseBlocks([], places)).toEqual({ ok: true, blocks: [] });
	});

	it('refuses what is not a list, or not JSON', () => {
		expect(parseBlocks('{', places)).toEqual({ ok: false, error: 'format' });
		expect(parseBlocks({ id: 'ab12' }, places)).toEqual({ ok: false, error: 'format' });
		expect(parseBlocks(null, places)).toEqual({ ok: false, error: 'format' });
		expect(parseBlocks('x'.repeat(20_001), places)).toEqual({ ok: false, error: 'format' });
	});

	it('refuses a card the site does not know, a size it does not offer, a malformed id', () => {
		for (const bad of [
			block({ type: 'astrology' }),
			block({ size: 'xl' }),
			block({ id: 'A' }),
			block({ id: 'ab 12' }),
			block({ place: 'not-a-uuid' }),
			block({ id: 3 }),
			null,
			'text'
		])
			expect(parseBlocks([bad], places)).toEqual({ ok: false, error: 'block' });
	});

	it('refuses a place that is not one of the account, whoever it belongs to', () => {
		const other = '33333333-3333-4333-8333-333333333333';
		expect(parseBlocks([block({ place: other })], places)).toEqual({ ok: false, error: 'place' });
	});

	it('refuses two blocks with the same id, and more blocks than a page holds', () => {
		expect(parseBlocks([block(), block({ type: 'tide' })], places)).toEqual({
			ok: false,
			error: 'duplicate'
		});
		const many = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) =>
			block({ id: `b${String(i).padStart(3, '0')}` })
		);
		expect(parseBlocks(many, places)).toEqual({ ok: false, error: 'too_many' });
		expect(parseBlocks(many.slice(1), places).ok).toBe(true);
	});
});

describe('liveBlocks', () => {
	it('drops the blocks of a place that is gone, and keeps the order', () => {
		const blocks = [
			{ id: 'aaaa', type: 'weather', place: A, size: 's' },
			{ id: 'bbbb', type: 'tide', place: B, size: 's' },
			{ id: 'cccc', type: 'sky', place: A, size: 'm' }
		] as const;
		expect(liveBlocks(blocks, new Set([A])).map((b) => b.id)).toEqual(['aaaa', 'cccc']);
	});
});

describe('newBlockId and parseTitle', () => {
	it('makes ids that the parser accepts, and that differ', () => {
		const ids = new Set(Array.from({ length: 50 }, newBlockId));
		expect(ids.size).toBe(50);
		for (const id of ids) expect(parseBlocks([block({ id })], places).ok).toBe(true);
	});

	it('cleans a title and refuses an empty or a long one', () => {
		expect(parseTitle('  Ma   page \n')).toBe('Ma page');
		expect(parseTitle('')).toBeNull();
		expect(parseTitle('x'.repeat(61))).toBeNull();
		expect(parseTitle(12)).toBeNull();
	});
});
