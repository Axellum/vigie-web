import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HA_CARD_COMMIT, HA_CARD_SHA256, HA_CARD_URL } from './haCard';

// The copy of the Home Assistant card is the file of vigie-api at the commit named, untouched (scripts/sync-ha-card.mjs).
const file = readFileSync(join(import.meta.dirname, '..', '..', '..', 'static', 'ha-card', 'vigie-card.js'));
const text = file.toString('utf8');

describe('the copy of the Home Assistant card', () => {
	it('is the file of the commit named, byte for byte', () => {
		expect(HA_CARD_COMMIT).toMatch(/^[0-9a-f]{40}$/);
		expect(createHash('sha256').update(file).digest('hex')).toBe(HA_CARD_SHA256);
		expect(HA_CARD_URL).toBe(`/ha-card/vigie-card.js?v=${HA_CARD_SHA256.slice(0, 12)}`);
	});

	it('still has what the home face relies on', () => {
		// The element, its data asked with this command, its configuration and Home Assistant set on it, its home page.
		expect(text).toContain("const TAG = 'vigie-card'");
		expect(text).toContain("type: 'vigie/card/data'");
		expect(text).toMatch(/setConfig\(config\) \{/);
		expect(text).toMatch(/set hass\(hass\) \{/);
		expect(text).toContain("const PAGE_IDS = ['home'");
		expect(text).toContain('themes?.darkMode');
	});
});
