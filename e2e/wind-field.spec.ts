import { expect, test, type Page } from '@playwright/test';

// The forecast wind of the map (`GET /v1/wind/field` of the API, e2e/fixtures/wind-field.json and its three images: ARPEGE over the
// world and Europe, AROME over France, run of 2026-11-21 18 UTC, valid at 2026-11-22 00 UTC, 01:00 Paris time). Off until the visitor
// turns it on; then thin trails over the map: the world's grid at once, Europe's and France's when the map comes close.

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected when the map moves over it (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const toggle = (page: Page) => page.getByTestId('flow-toggle');
const canvas = (page: Page) => page.getByTestId('wind-flow');
const open = async (page: Page) => {
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
};
/** The pixels the trails cover now (-1: no canvas), a print of where they are, and whether WebGL draws them. */
const trails = (page: Page) =>
	page.evaluate(() => {
		const c = document.querySelector<HTMLCanvasElement>('canvas.vigie-flow');
		if (!c) return { inked: -1, print: 0, webgl: false };
		// WebGL draws the trails, or a 2D canvas without it: copied on a 2D canvas to be read either way (what WebGL drew stays
		// readable in a browser driven by tests, $lib/windFlowGl).
		const copy = document.createElement('canvas');
		copy.width = c.width;
		copy.height = c.height;
		const ctx = copy.getContext('2d')!;
		ctx.drawImage(c, 0, 0);
		const data = ctx.getImageData(0, 0, c.width, c.height).data;
		let inked = 0;
		let print = 0;
		for (let i = 3; i < data.length; i += 4)
			if (data[i] > 0) {
				inked++;
				print = (print * 31 + i) % 1_000_000_007;
			}
		// A canvas that has a WebGL context gives no 2D one.
		return { inked, print, webgl: c.getContext('2d') === null };
	});

test('off at first, then moving trails over the world with the hour and the credit, finer grids close in', async ({
	page
}) => {
	const errors = collectErrors(page);
	const images: string[] = [];
	page.on('request', (r) => {
		if (r.url().includes('/data/wind-field/')) images.push(new URL(r.url()).pathname);
	});
	await open(page);
	await expect(toggle(page)).not.toBeChecked();
	await expect(canvas(page)).toHaveCount(0);

	await toggle(page).check();
	await expect(page.getByTestId('flow-legend')).toContainText('Prévision de Météo-France pour 01:00');
	await expect(page.locator('.flow-scale')).toContainText('40 km/h et plus');
	await expect(page.locator('.credits')).toContainText('forecast models AROME (France) and ARPEGE');
	await expect.poll(async () => (await trails(page)).inked, { timeout: 15_000 }).toBeGreaterThan(300);
	expect(images).toEqual(['/data/wind-field/world/2026112200-2026112118.png']);
	expect((await trails(page)).webgl).toBe(true);

	// The trails move, and lie over the map's canvas, under its markers (which come after them in the page).
	const before = await trails(page);
	await page.waitForTimeout(400);
	expect((await trails(page)).print).not.toBe(before.print);
	expect(
		await page.evaluate(() => document.querySelector('.maplibregl-canvas')?.nextElementSibling?.className)
	).toBe('vigie-flow');

	// Over France, close in: Europe's grid, then AROME's.
	await page.getByRole('button', { name: 'France', exact: true }).click();
	await expect.poll(() => images.length, { timeout: 15_000 }).toBe(2);
	// AROME from zoom 5: one step closer on a wide screen, two on a phone.
	for (let i = 0; i < 3 && !images.some((p) => p.includes('/france/')); i++) {
		await page.locator('.maplibregl-ctrl-zoom-in').click();
		await page.waitForTimeout(1500);
	}
	await expect
		.poll(() => [...images].sort(), { timeout: 15_000 })
		.toEqual([
			'/data/wind-field/europe/2026112200-2026112118.png',
			'/data/wind-field/france/2026112200-2026112118.png',
			'/data/wind-field/world/2026112200-2026112118.png'
		]);
	await expect.poll(async () => (await trails(page)).inked, { timeout: 15_000 }).toBeGreaterThan(300);

	await toggle(page).uncheck();
	await expect(canvas(page)).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('"on" is kept for the next visit, and with reduced motion the trails are drawn still', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await open(page);
	await toggle(page).check();
	await expect.poll(async () => (await trails(page)).inked, { timeout: 15_000 }).toBeGreaterThan(300);
	const still = await trails(page);
	await page.waitForTimeout(500);
	expect((await trails(page)).print).toBe(still.print);

	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await expect(toggle(page)).toBeChecked();
	await expect.poll(async () => (await trails(page)).inked, { timeout: 15_000 }).toBeGreaterThan(300);
});

test('without WebGL 2, the trails are drawn on a 2D canvas, and move', async ({ page }) => {
	const errors = collectErrors(page);
	await page.addInitScript(() => {
		const get = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...rest: unknown[]
		) {
			if (type === 'webgl2' && this.classList.contains('vigie-flow')) return null;
			return (get as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(this, type, ...rest);
		} as typeof get;
	});
	await open(page);
	await toggle(page).check();
	await expect.poll(async () => (await trails(page)).inked, { timeout: 15_000 }).toBeGreaterThan(300);
	const before = await trails(page);
	expect(before.webgl).toBe(false);
	await page.waitForTimeout(400);
	expect((await trails(page)).print).not.toBe(before.print);
	expect(errors).toEqual([]);
});

test('an image the site does not list is not relayed', async ({ request }) => {
	expect((await request.get('/data/wind-field/france/2026112201-2026112118.png')).status()).toBe(404);
	expect((await request.get('/data/wind-field/mars/2026112200-2026112118.png')).status()).toBe(404);
	expect((await request.get('/data/wind-field/france/latest.png')).status()).toBe(404);
	const listed = await request.get('/data/wind-field/world/2026112200-2026112118.png');
	expect(listed.status()).toBe(200);
	expect(listed.headers()['content-type']).toBe('image/png');
	expect(listed.headers()['cache-control']).toContain('immutable');
	const list = await request.get('/data/wind-field.json');
	expect((await list.json()).levels.map((l: { image: string }) => l.image)).toEqual([
		'/data/wind-field/world/2026112200-2026112118.png',
		'/data/wind-field/europe/2026112200-2026112118.png',
		'/data/wind-field/france/2026112200-2026112118.png'
	]);
});
