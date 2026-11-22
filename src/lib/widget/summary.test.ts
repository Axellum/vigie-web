import { afterEach, describe, expect, it } from 'vitest';
import type { WarningSummary } from '../types';
import { labelOf, postToHost, widgetSummary } from './summary';

const warning = (over: Partial<WarningSummary>): WarningSummary => ({
	id: 'w',
	apiId: null,
	cc: 'FR',
	source: 'meteofrance',
	level: 'YELLOW',
	levelOriginal: null,
	phenomenon: 'wind',
	area: '64',
	sent: null,
	onset: null,
	expires: null,
	ends: null,
	shape: '64',
	texts: [],
	...over
});

describe('the summary for the desktop app', () => {
	it('names a phenomenon with the site’s words, in both languages', () => {
		expect(labelOf('fr')(warning({}))).toBe('Vent');
		expect(labelOf('en')(warning({ phenomenon: 'coastal' }))).toBe('Waves, coastal flooding');
		expect(
			labelOf('fr')(
				warning({
					phenomenon: 'other',
					texts: [{ language: 'fr', headline: null, event: 'Vigilance jaune canicule' }]
				})
			)
		).toBe('Canicule');
	});

	it('is ready once the warnings and the weather have come', () => {
		const base = {
			lang: 'fr' as const,
			now: 1000,
			name: 'Biarritz',
			rain: null,
			tempC: 15.4,
			spot: null
		};
		const vigilance = { state: 'none' as const, level: null, labels: [], until: null, more: 0 };
		expect(widgetSummary({ ...base, vigilance, weatherLoading: false })).toMatchObject({
			type: 'vigie-summary',
			version: 1,
			ready: true,
			name: 'Biarritz',
			vigilance: { state: 'none', level: null },
			tempC: 15.4,
			at: 1000
		});
		expect(widgetSummary({ ...base, vigilance, weatherLoading: true }).ready).toBe(false);
		expect(
			widgetSummary({ ...base, vigilance: { ...vigilance, state: 'loading' }, weatherLoading: false }).ready
		).toBe(false);
	});
});

describe('the host of the page', () => {
	afterEach(() => {
		delete (globalThis as { chrome?: unknown }).chrome;
	});

	it('gets the summary when there is one, and nothing breaks without it', () => {
		const got: unknown[] = [];
		const summary = widgetSummary({
			lang: 'en',
			now: 1,
			name: null,
			vigilance: null,
			rain: null,
			weatherLoading: false,
			tempC: null,
			spot: null
		});
		expect(() => postToHost(summary)).not.toThrow();
		(globalThis as { chrome?: unknown }).chrome = { webview: { postMessage: (m: unknown) => got.push(m) } };
		postToHost(summary);
		expect(got).toEqual([summary]);
	});
});
