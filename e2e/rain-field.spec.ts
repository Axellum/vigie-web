import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeLayers, openLayers } from './layers';

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
	await openLayers(page, 'Pluie');
	const toggle = page.getByTestId('rain-field-toggle');
	await expect(toggle).not.toBeChecked();
	await expect(page.getByTestId('rain-field-badge')).toHaveCount(0);

	await toggle.check();
	await expect(page.getByTestId('rain-field-leads')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('rain-field-disclaimer')).toContainText('Prévision, pas un radar.');
	await expect(page.getByTestId('rain-field-scale')).toContainText('mm/h');
	await expect(page.locator('.credits')).toContainText('Licence Ouverte 2.0');
	// The badge of the layer is over the map, once its family is folded.
	await closeLayers(page);
	await expect(page.getByTestId('rain-field-badge')).toBeVisible();
	await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
	expect(asked[0]).toMatch(/^\/data\/rain-field\/world\/\d{10}-\d{10}\.png$/);

	// Switch lead time to +6 h.
	await openLayers(page, 'Pluie');
	await page.getByTestId('rain-field-leads').getByRole('button', { name: '+6 h' }).click();
	await expect(page.getByTestId('rain-field-legend')).toContainText('+6 h');
	await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

	// English check.
	await open(page, '/?lang=en');
	await openLayers(page, 'Rain');
	await expect(page.getByTestId('rain-field-toggle')).toBeChecked();
	await expect(page.getByTestId('rain-field-disclaimer')).toContainText('Forecast, not a radar.');

	await page.getByTestId('rain-field-toggle').uncheck();
	await closeLayers(page);
	await expect(page.getByTestId('rain-field-badge')).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

/** The levels of forecast rain on the map, from the bottom (`window.vigieMap`, set in a browser driven by tests): a coarser
 * level is drawn in pieces around a finer one (`rain-field-<level>-<n>`). */
const rainLayers = (page: Page) =>
	page.evaluate(() => [
		...new Set(
			(window as unknown as { vigieMap: { getStyle(): { layers: { id: string }[] } } }).vigieMap
				.getStyle()
				.layers.map((l) => l.id)
				.filter((id) => id.startsWith('rain-field-'))
				.map((id) => id.split('-')[2])
		)
	]);

test('the forecast rain shows the world around the Europe grid, and stays on the map while another lead time loads', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/data/rain-field/')) asked.push(new URL(r.url()).pathname);
	});
	await open(page);
	await openLayers(page, 'Pluie');
	await page.getByTestId('rain-field-toggle').check();
	// Europe and the North Atlantic at zoom 3, wider than the Europe grid (32° W to 42° E): the world's image around it.
	await page.evaluate(() =>
		(window as unknown as { vigieMap: { jumpTo(o: object): void } }).vigieMap.jumpTo({
			center: [30, 52],
			zoom: 3.05
		})
	);
	await expect.poll(() => rainLayers(page), { timeout: 15_000 }).toEqual(['world', 'europe']);

	// At every image while +6 h loads, the rain of +1 h is still drawn: both levels there, their sources loaded.
	await page.evaluate(() => {
		type Src = { loaded(): boolean } | undefined;
		const w = window as unknown as {
			vigieMap: { getStyle(): { layers: { id: string }[] }; getSource(id: string): Src };
			rainGaps: number;
			rainWatch: boolean;
		};
		w.rainGaps = 0;
		w.rainWatch = true;
		const tick = () => {
			const ids = w.vigieMap
				.getStyle()
				.layers.map((l) => l.id)
				.filter((id) => id.startsWith('rain-field-'));
			const levels = new Set(ids.map((id) => id.split('-')[2]));
			if (levels.size < 2 || !ids.every((id) => w.vigieMap.getSource(id)?.loaded())) w.rainGaps++;
			if (w.rainWatch) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const before = asked.length;
	await page.getByTestId('rain-field-leads').getByRole('button', { name: '+6 h' }).click();
	await expect(page.getByTestId('rain-field-legend')).toContainText('+6 h');
	await expect.poll(() => asked.length - before, { timeout: 15_000 }).toBe(2);
	await page.waitForTimeout(800);
	const gaps = await page.evaluate(() => {
		const w = window as unknown as { rainGaps: number; rainWatch: boolean };
		w.rainWatch = false;
		return w.rainGaps;
	});
	expect(gaps).toBe(0);
	expect(asked.slice(before).sort()).toEqual([
		expect.stringMatching(/^\/data\/rain-field\/europe\//),
		expect.stringMatching(/^\/data\/rain-field\/world\//)
	]);
	expect(await rainLayers(page)).toEqual(['world', 'europe']);
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
	// At the address of its run, a tile is kept; without the run (or with another one) a minute only: the next run draws it again.
	const tile = await request.get(
		`/data/radar/france/nowcast/tiles/${firstEpoch}/6/32/22.png?run=${nowcastFixture.run_utc}`
	);
	expect(tile.status()).toBe(200);
	expect(tile.headers()['content-type']).toBe('image/png');
	expect(tile.headers()['cache-control']).toContain('immutable');
	for (const query of ['', `?run=${nowcastFixture.run_utc - 300}`]) {
		const other = await request.get(`/data/radar/france/nowcast/tiles/${firstEpoch}/6/32/22.png${query}`);
		expect(other.status()).toBe(200);
		expect(other.headers()['cache-control']).toBe('public, max-age=60');
	}
	expect(
		(await request.get(`/data/radar/france/nowcast/tiles/${firstEpoch}/6/32/22.png?run=x`)).status()
	).toBe(404);
	expect((await tile.body()).subarray(1, 4).toString()).toBe('PNG');

	expect((await request.get('/data/radar/france/nowcast/tiles/1000/6/32/22.png')).status()).toBe(404);
	expect((await request.get(`/data/radar/france/nowcast/tiles/${firstEpoch}/11/0/0.png`)).status()).toBe(404);
});
