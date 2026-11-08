import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_CHOICE,
	parseChoice,
	readChoice,
	SEA_KEY,
	updateChoice,
	validRange,
	writeChoice
} from './choice';

describe('the choice kept in the browser', () => {
	it('reads what was stored, field by field, and gives the default for the rest', () => {
		expect(parseChoice(JSON.stringify({ activity: 'kite', unit: 'kn', wind: { min: 15, max: 30 } }))).toEqual(
			{
				activity: 'kite',
				unit: 'kn',
				wind: { min: 15, max: 30 }
			}
		);
		expect(
			parseChoice(JSON.stringify({ activity: 'diving', unit: 'mph', wind: { min: 30, max: 15 } }))
		).toEqual(DEFAULT_CHOICE);
		expect(parseChoice(JSON.stringify({ activity: 'boat' }))).toEqual({
			...DEFAULT_CHOICE,
			activity: 'boat'
		});
	});

	it('gives the default for anything that is not a stored choice', () => {
		for (const raw of [null, '', 'not json', '[]', '12', 'null', '"kite"'])
			expect(parseChoice(raw)).toEqual(DEFAULT_CHOICE);
	});

	it('accepts only a wind range the API would accept, rounded to a tenth of a knot', () => {
		expect(validRange(12, 25)).toEqual({ min: 12, max: 25 });
		expect(validRange(12.04, 24.96)).toEqual({ min: 12, max: 25 });
		expect(validRange(60 - 1, 60)).toEqual({ min: 59, max: 60 });
		for (const [min, max] of [
			[0, 10],
			[-5, 10],
			[20, 10],
			[10, 10],
			[12, 61],
			[Number.NaN, 20],
			['12', 25]
		])
			expect(validRange(min, max)).toBeNull();
	});
});

describe('the storage of the browser', () => {
	afterEach(() => vi.unstubAllGlobals());

	function storage(initial: Record<string, string> = {}) {
		const data = { ...initial };
		return {
			data,
			getItem: (k: string) => data[k] ?? null,
			setItem: (k: string, v: string) => {
				data[k] = v;
			}
		};
	}

	it('keeps a change and the fields it did not touch', () => {
		const s = storage({ [SEA_KEY]: JSON.stringify({ activity: 'surf', unit: 'kn' }) });
		vi.stubGlobal('localStorage', s);
		expect(updateChoice({ activity: 'boat' })).toEqual({ activity: 'boat', unit: 'kn', wind: null });
		expect(readChoice()).toEqual({ activity: 'boat', unit: 'kn', wind: null });
		expect(JSON.parse(s.data[SEA_KEY])).toEqual({ activity: 'boat', unit: 'kn', wind: null });
	});

	it('works without the storage: the default choice, and the change is still returned', () => {
		const refuse = () => {
			throw new DOMException('blocked', 'SecurityError');
		};
		vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse });
		expect(readChoice()).toEqual(DEFAULT_CHOICE);
		expect(writeChoice(DEFAULT_CHOICE)).toBe(false);
		expect(updateChoice({ activity: 'kite' })).toEqual({ ...DEFAULT_CHOICE, activity: 'kite' });
	});
});
