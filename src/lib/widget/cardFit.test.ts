import { describe, expect, it } from 'vitest';
import { cardFrame, cardStyle } from './cardFit';

describe('the card in a widget', () => {
	it('fills the whole frames of the Windows widgets board, room left for its menu', () => {
		const medium = cardFrame('medium', 'hours', 'bare', 300, 303);
		expect(medium.scale).toBe(0.74);
		expect(medium.width).toBe(405);
		expect(medium.top).toBe(11);
		expect(cardFrame('medium', 'days', 'bare', 300, 303).scale).toBe(0.68);
		const large = cardFrame('large', 'hours', 'bare', 300, 462);
		expect(large.scale).toBe(0.68);
		// The facts of now sit in the top right corner, under the board's « ··· ».
		expect(large.top).toBe(41);
		expect(large.height).toBe(680);
	});

	it('leaves the band of the board empty, and stays under the wide layout in a wide page', () => {
		const banded = cardFrame('medium', 'hours', 'board', 300, 303);
		expect(banded.scale).toBeLessThan(0.7);
		expect(Math.round(banded.top * banded.scale)).toBe(48);
		const wide = cardFrame('large', 'hours', null, 1200, 700);
		expect(wide.width).toBe(600);
		expect(wide.left).toBeGreaterThan(200);
	});

	it('leaves out the facts of now and the block not chosen in the medium widget only', () => {
		const f = cardFrame('medium', 'days', 'bare', 300, 303);
		const days = cardStyle(f, 'medium', 'days', 'sky');
		expect(days).toContain('.now-f');
		expect(days).toContain('.pile > .bloc:has(.hr)');
		expect(days).toContain('--vc-carte:#284d7d');
		expect(days).toContain(`ha-card{height:${f.height}px`);
		expect(cardStyle(f, 'medium', 'hours', 'dark')).toContain('.pile > .bloc:has(.dh)');
		const large = cardStyle(cardFrame('large', 'days', 'bare', 300, 462), 'large', 'days', 'light');
		expect(large).not.toContain('.now-f');
		expect(large).not.toContain(':has(');
		expect(large).toContain('.nav');
	});
});
