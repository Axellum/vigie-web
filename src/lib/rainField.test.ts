import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	availableLeadHours,
	imageCoordinates,
	pickRainOverlay,
	rainFieldFromApi,
	rainLevelFrom
} from './rainField';
import { parseRainFieldChoice } from './rainFieldLayer.svelte';

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'e2e', 'fixtures', 'rain-field.json'), 'utf-8'));

describe('rainField', () => {
	it('parses the recorded rain-field payload and rewrites frame URLs to the site proxy', () => {
		const rf = rainFieldFromApi(fixture);
		expect(rf?.status).toBe('ok');
		expect(rf?.levels.map((l) => l.id)).toEqual(['world', 'europe', 'france']);
		expect(availableLeadHours(rf)).toEqual([1, 2, 3, 6, 12, 24]);
		expect(rf?.levels[0].frames[0].url).toMatch(/^\/data\/rain-field\/world\/\d{10}-\d{10}\.png$/);
		expect(rf?.legend).toHaveLength(9);
		expect(rf?.attribution).toContain('Météo-France');
		expect(rf?.note).toContain('not a radar');
	});

	it('handles not_configured, unavailable and malformed answers honestly', () => {
		expect(rainFieldFromApi({ status: 'not_configured' })?.status).toBe('off');
		expect(rainFieldFromApi({ status: 'unavailable', levels: [] })?.status).toBe('unavailable');
		expect(rainFieldFromApi(null)).toBeNull();
		expect(rainLevelFrom('france')).toBe('france');
		expect(rainLevelFrom('mars')).toBeNull();
	});

	it('picks the finest level matching zoom and view, and clamps Mercator image corners', () => {
		const rf = rainFieldFromApi(fixture);
		const world = pickRainOverlay(rf, [-170, -58, 190, 75], 1.4, 3, 'credit');
		expect(world?.level.id).toBe('world');
		expect(world?.frame.leadHours).toBe(3);

		const europe = pickRainOverlay(rf, [-10, 38, 20, 56], 4, 6, 'credit');
		expect(europe?.level.id).toBe('europe');
		expect(europe?.frame.leadHours).toBe(6);

		const france = pickRainOverlay(rf, [-5.5, 41.2, 9.8, 51.3], 6, 1, 'credit');
		expect(france?.level.id).toBe('france');
		expect(france?.level.model).toBe('AROME');

		// Outside Europe/France even at high zoom falls back to world.
		const pacific = pickRainOverlay(rf, [130, 30, 145, 40], 6, 12, 'credit');
		expect(pacific?.level.id).toBe('world');

		const corners = imageCoordinates([-180, -90, 180, 90]);
		expect(corners[0][1]).toBeCloseTo(85.051129, 4);
		expect(corners[2][1]).toBeCloseTo(-85.051129, 4);
	});

	it('defaults the stored preference to off', () => {
		expect(parseRainFieldChoice(null)).toBe(false);
		expect(parseRainFieldChoice('invalid')).toBe(false);
		expect(parseRainFieldChoice('{"on":false}')).toBe(false);
		expect(parseRainFieldChoice('{"on":true}')).toBe(true);
	});
});
