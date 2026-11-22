import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const observedFixture = JSON.parse(
	readFileSync(join(import.meta.dirname, 'fixtures', 'rain-observed.json'), 'utf-8')
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

test('global observed satellite rain layer is off by default, switches frames, proxies tiles, shows disclaimer and NASA credit', async ({
	page
}) => {
	const errors = collectErrors(page);
	const askedTiles: string[] = [];
	const thirdPartyRainHosts: string[] = [];
	page.on('request', (r) => {
		const url = new URL(r.url());
		if (url.pathname.startsWith('/data/rain-observed/tiles/')) askedTiles.push(url.pathname);
		if (/nasa\.gov|earthdata|noaa\.gov/i.test(url.hostname)) thirdPartyRainHosts.push(url.href);
	});

	await open(page);
	const toggle = page.getByTestId('observed-rain-toggle');
	await expect(toggle).not.toBeChecked();
	await expect(page.getByTestId('observed-rain-badge')).toHaveCount(0);

	await toggle.check();
	await expect(page.getByTestId('observed-rain-frames')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('observed-rain-frames').getByRole('button')).toHaveCount(
		observedFixture.frames.length
	);
	await expect(page.getByTestId('observed-rain-legend')).toContainText('~10 km');
	await expect(page.getByTestId('observed-rain-legend')).toContainText('~5 h');
	await expect(page.getByTestId('observed-rain-scale')).toContainText('mm/h');
	await expect(page.getByTestId('observed-rain-scale')).toContainText('Pluie');
	await expect(page.getByTestId('observed-rain-scale')).toContainText('Neige');
	await expect(page.getByTestId('observed-rain-disclaimer')).toContainText('Estimation satellite');
	await expect(page.getByTestId('observed-rain-disclaimer')).toContainText('pas un radar au sol');
	await expect(page.locator('.credits')).toContainText("NASA's Global Imagery Browse Services (GIBS)");
	await expect(page.getByTestId('observed-rain-badge')).toBeVisible();

	const latestStamp = observedFixture.frames[observedFixture.frames.length - 1].stamp;
	await expect
		.poll(() => askedTiles.some((p) => p.startsWith(`/data/rain-observed/tiles/${latestStamp}/`)), {
			timeout: 15_000
		})
		.toBe(true);

	// Switch to an earlier observed frame (6 frames earlier).
	const earlierStamp = observedFixture.frames[3].stamp;
	const earlierBtn = page.locator(
		`[data-testid="observed-rain-frames"] button[data-stamp="${earlierStamp}"]`
	);
	await earlierBtn.click();
	await expect(earlierBtn).toHaveAttribute('aria-pressed', 'true');
	await expect
		.poll(() => askedTiles.some((p) => p.startsWith(`/data/rain-observed/tiles/${earlierStamp}/`)), {
			timeout: 15_000
		})
		.toBe(true);

	// Privacy rule: browser must NEVER talk directly to NASA or NOAA.
	expect(thirdPartyRainHosts).toEqual([]);

	// English check.
	await open(page, '/?lang=en');
	await expect(page.getByTestId('observed-rain-toggle')).toBeChecked();
	await expect(page.getByTestId('observed-rain-scale')).toContainText('Rain');
	await expect(page.getByTestId('observed-rain-scale')).toContainText('Snow');
	await expect(page.getByTestId('observed-rain-disclaimer')).toContainText('Satellite estimate');
	await expect(page.getByTestId('observed-rain-disclaimer')).toContainText('not a ground radar');

	await page.getByTestId('observed-rain-toggle').uncheck();
	await expect(page.getByTestId('observed-rain-badge')).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('server proxy routes validate observed-rain requests cleanly', async ({ request }) => {
	const meta = await request.get('/data/rain-observed');
	expect(meta.status()).toBe(200);
	expect(meta.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await meta.json();
	expect(body.status).toBe('ok');
	expect(body.frames).toHaveLength(observedFixture.frames.length);
	expect(body.frames[0].tiles).toMatch(/^\/data\/rain-observed\/tiles\/\d{12}\/\{z\}\/\{x\}\/\{y\}\.png$/);

	const validStamp = observedFixture.frames[0].stamp;
	const tile = await request.get(`/data/rain-observed/tiles/${validStamp}/2/2/1.png`);
	expect(tile.status()).toBe(200);
	expect(tile.headers()['content-type']).toBe('image/png');
	expect(tile.headers()['cache-control']).toContain('immutable');
	expect((await tile.body()).subarray(1, 4).toString()).toBe('PNG');

	// Reject unknown stamps, invalid stamp formats, out-of-range zooms, and invalid tile coords.
	expect((await request.get('/data/rain-observed/tiles/199901010000/2/2/1.png')).status()).toBe(404);
	expect((await request.get('/data/rain-observed/tiles/latest/2/2/1.png')).status()).toBe(404);
	expect((await request.get(`/data/rain-observed/tiles/${validStamp}/7/0/0.png`)).status()).toBe(404);
	expect((await request.get(`/data/rain-observed/tiles/${validStamp}/2/4/0.png`)).status()).toBe(404);
});
