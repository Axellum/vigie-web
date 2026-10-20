import { describe, expect, it } from 'vitest';
import { asLang, langFromHeader, t } from './i18n';
import { relative } from './format';
import { byLevelThenTime, maxLevel } from './levels';

describe('i18n', () => {
	it('reads the language from the Accept-Language header', () => {
		expect(langFromHeader('en-GB,en;q=0.9,fr;q=0.8')).toBe('en');
		expect(langFromHeader('de-DE,fr;q=0.5')).toBe('fr');
		expect(langFromHeader(null)).toBe('fr');
		expect(asLang('EN')).toBe('en');
		expect(asLang('es')).toBeNull();
	});

	it('fills parameters', () => {
		expect(t('fr', 'detail.zoneWarnings', { n: 3 })).toBe('3 vigilance(s) sur cette zone');
		expect(t('en', 'time.ago', { d: '3 h' })).toBe('3 h ago');
	});

	it('writes relative times', () => {
		expect(relative('fr', 1000 - 600, 1000)).toBe('il y a 10 min');
		expect(relative('en', 1000 + 7200, 1000)).toBe('in 2 h');
		expect(relative('fr', null, 1000)).toBe('–');
	});
});

describe('levels', () => {
	it('sorts by level, then by time, unknown levels last', () => {
		const items = [
			{ level: null, time: 9 },
			{ level: 'YELLOW' as const, time: 1 },
			{ level: 'RED' as const, time: 1 },
			{ level: 'YELLOW' as const, time: 5 }
		];
		expect(items.sort(byLevelThenTime).map((i) => `${i.level}:${i.time}`)).toEqual([
			'RED:1',
			'YELLOW:5',
			'YELLOW:1',
			'null:9'
		]);
		expect(maxLevel(['YELLOW', null, 'ORANGE'])).toBe('ORANGE');
		expect(maxLevel([null])).toBeNull();
	});
});
