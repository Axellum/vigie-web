import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	formatObservedLatency,
	OBSERVED_RAIN_STAMP,
	observedRainFromApi,
	observedRainOnMap,
	observedRainTilePath,
	pickObservedRainFrame
} from './observedRain';
import { parseObservedRainChoice } from './observedRainLayer.svelte';

const fixture = JSON.parse(
	readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'rain-observed.json'), 'utf-8')
);

describe('observedRain', () => {
	it('parses the recorded rain-observed payload and rewrites tile URLs to the site proxy', () => {
		const obs = observedRainFromApi(fixture);
		expect(obs?.status).toBe('ok');
		expect(obs?.sourceModel).toBe('nasa-gibs-imerg-30min');
		expect(obs?.minZoom).toBe(0);
		expect(obs?.maxZoom).toBe(6);
		expect(obs?.intervalMinutes).toBe(30);
		expect(obs?.resolutionKm).toBe(10);
		expect(obs?.typicalLatencyMinutes).toBe(300);
		expect(obs?.frames).toHaveLength(12);
		expect(obs?.frames[0].stamp).toBe('202611220700');
		expect(obs?.frames[11].stamp).toBe('202611221230');
		expect(obs?.frames[0].tiles).toBe('/data/rain-observed/tiles/202611220700/{z}/{x}/{y}.png');
		expect(obs?.legend).toHaveLength(9);
		expect(obs?.snowLegend).toHaveLength(9);
		expect(obs?.attribution).toContain('NASA');
		expect(obs?.licence).toContain('CC0');
		expect(obs?.note).toContain('Not a ground weather radar');
	});

	it('handles disabled, not_configured, unavailable and malformed answers honestly', () => {
		expect(observedRainFromApi({ status: 'disabled', frames: [] })?.status).toBe('off');
		expect(observedRainFromApi({ status: 'not_configured' })?.status).toBe('off');
		expect(observedRainFromApi({ status: 'unavailable', frames: [] })?.status).toBe('unavailable');
		expect(observedRainFromApi({ status: 'ok', frames: [] })?.status).toBe('unavailable');
		expect(observedRainFromApi(null)).toBeNull();
		expect(observedRainFromApi({ status: 'bogus' })).toBeNull();
		expect(OBSERVED_RAIN_STAMP.test('202611221230')).toBe(true);
		expect(OBSERVED_RAIN_STAMP.test('latest')).toBe(false);
		expect(OBSERVED_RAIN_STAMP.test('2026112212')).toBe(false);
	});

	it('picks the selected frame or defaults to the latest observed frame', () => {
		const obs = observedRainFromApi(fixture);
		const latest = pickObservedRainFrame(obs, null);
		expect(latest?.stamp).toBe('202611221230');

		const earlier = pickObservedRainFrame(obs, '202611220930');
		expect(earlier?.stamp).toBe('202611220930');

		const fallback = pickObservedRainFrame(obs, '199901010000');
		expect(fallback?.stamp).toBe('202611221230');

		const onMap = observedRainOnMap(obs, '202611220930', 'NASA GIBS');
		expect(onMap).toEqual({
			id: 'observed-rain-202611220930',
			tiles: observedRainTilePath('202611220930'),
			minZoom: 0,
			maxZoom: 6,
			bounds: [-180, -85.051129, 180, 85.051129],
			attribution: 'NASA GIBS'
		});
	});

	it('formats satellite latency without fabricating values and defaults stored choice to off', () => {
		expect(formatObservedLatency(300)).toBe('5 h');
		expect(formatObservedLatency(270)).toBe('4 h 30');
		expect(formatObservedLatency(45)).toBe('45 min');

		expect(parseObservedRainChoice(null)).toBe(false);
		expect(parseObservedRainChoice('invalid')).toBe(false);
		expect(parseObservedRainChoice('{"on":false}')).toBe(false);
		expect(parseObservedRainChoice('{"on":true}')).toBe(true);
	});
});
