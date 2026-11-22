import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const rainFixture = JSON.parse(
	readFileSync(join(import.meta.dirname, 'fixtures', 'rain-field.json'), 'utf-8')
);
const nowcastFixture = JSON.parse(
	readFileSync(join(import.meta.dirname, 'fixtures', 'radar-france-nowcast.json'), 'utf-8')
);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const open = async (page: Page, path = '/') => {
	await page.goto(path);
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
};

test('global forecast rain layer is off by default, switches lead times, shows disclaimer and credit', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/data/rain-field/')) asked.push(new URL(r.url()).pathname);
	});

	await open(page);
	const toggle = page.getByTestId('rain-field-toggle');
	await expect(toggle).not.toBeChecked();
	await expect(page.getByTestId('rain-field-badge')).toHaveCount(0);

	await toggle.check();
	await expect(page.getByTestId('rain-field-leads')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('rain-field-disclaimer')).toContainText('Prévision, pas un radar.');
	await expect(page.getByTestId('rain-field-scale')).toContainText('mm/h');
	await expect(page.locator('.credits')).toContainText('Licence Ouverte 2.0');
	await expect(page.getByTestId('rain-field-badge')).toBeVisible();
	await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
	expect(asked[0]).toMatch(/^\/data\/rain-field\/world\/\d{10}-\d{10}\.png$/);

	// Switch lead time to +6 h.
	await page.getByTestId('rain-field-leads').getByRole('button', { name: '+6 h' }).click();
	await expect(page.getByTestId('rain-field-legend')).toContainText('+6 h');
	await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

	// English check.
	await open(page, '/?lang=en');
	await expect(page.getByTestId('rain-field-toggle')).toBeChecked();
	await expect(page.getByTestId('rain-field-disclaimer')).toContainText('Forecast, not a radar.');

	await page.getByTestId('rain-field-toggle').uncheck();
	await expect(page.getByTestId('rain-field-badge')).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('server proxy routes validate rain-field and PIAF nowcast requests cleanly', async ({ request }) => {
	const rf = await request.get('/data/rain-field');
	expect(rf.status()).toBe(200);
	expect(rf.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const rfBody = await rf.json();
	expect(rfBody.status).toBe('ok');
	expect(rfBody.levels).toHaveLength(3);

	const validFrame = rainFixture.levels[0].frames[0];
	const img = await request.get(`/data/rain-field/world/${validFrame.stamp}.png`);
	expect(img.status()).toBe(200);
	expect(img.headers()['content-type']).toBe('image/png');
	expect(img.headers()['cache-control']).toContain('immutable');
	expect((await img.body()).subarray(1, 4).toString()).toBe('PNG');

	expect((await request.get('/data/rain-field/mars/2026112214-2026112206.png')).status()).toBe(404);
	expect((await request.get('/data/rain-field/world/1999010100-1999010100.png')).status()).toBe(404);
	expect((await request.get('/data/rain-field/world/latest.png')).status()).toBe(404);

	// PIAF +1h nowcast proxy routes
	const nc = await request.get('/data/radar/france/nowcast');
	expect(nc.status()).toBe(200);
	expect(nc.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const ncBody = await nc.json();
	expect(ncBody.frames).toHaveLength(nowcastFixture.frames.length);

	const firstEpoch = nowcastFixture.frames[0].epoch;
	const tile = await request.get(`/data/radar/france/nowcast/tiles/${firstEpoch}/6/32/22.png`);
	expect(tile.status()).toBe(200);
	expect(tile.headers()['content-type']).toBe('image/png');
	expect(tile.headers()['cache-control']).toContain('immutable');
	expect((await tile.body()).subarray(1, 4).toString()).toBe('PNG');

	expect((await request.get('/data/radar/france/nowcast/tiles/1000/6/32/22.png')).status()).toBe(404);
	expect((await request.get(`/data/radar/france/nowcast/tiles/${firstEpoch}/11/0/0.png`)).status()).toBe(404);
});
