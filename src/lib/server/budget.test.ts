import { describe, expect, it } from 'vitest';
import { SlidingBudget } from './budget';

describe('SlidingBudget', () => {
	it('lets through the limit, then refuses until the oldest request leaves the window', () => {
		let now = 0;
		const budget = new SlidingBudget(2, 1000, () => now);
		expect(budget.take()).toBe(true);
		now = 400;
		expect(budget.take()).toBe(true);
		expect(budget.take()).toBe(false);
		expect(budget.used()).toBe(2);
		now = 1000;
		expect(budget.take()).toBe(true);
		expect(budget.take()).toBe(false);
		now = 1400;
		expect(budget.used()).toBe(1);
	});
});
