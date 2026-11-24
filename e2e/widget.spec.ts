import { expect, test, type Page } from '@playwright/test';

// The widget page (/widget), which a desktop app shows in a panel a few hundred pixels wide: a place after the `#`, a surf spot in
// the query. The data are the recorded ones of the mock API: the weather of a point in Corsica, the warnings of France, the
// television spot of Hossegor.
const PLACE = '#42.306,9.149/Corte';
const SIZES = { small: [300, 98], medium: [300, 256], large: [300, 572] } as const;

test.skip(
	({ isMobile }) => isMobile,
	'a widget has its own size: the desktop project is the one that runs these'
);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

/** What the widget holds below its own height: a widget cannot scroll. */
const overflow = (page: Page) =>
	page.locator('.widget').evaluate((w) => Math.max(0, w.scrollHeight - w.clientHeight));

test('a place: its sky, its warnings and its rain, and the exact position never leaves the browser', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => asked.push(r.url()));
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto(`/widget?size=medium${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('Corte')).toBeVisible();
	await expect(page.getByText('17°')).toBeVisible();
	// The recorded weather is weeks old: the rain of the hour is not told from it.
	await expect(page.getByText('Pluie de l’heure non lue')).toBeVisible();
	await expect(page.getByText(/Vigilance|vigilance/).first()).toBeVisible();
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	expect(await overflow(page)).toBe(0);
	// Only the cell of the grid goes to the server, for the weather and the measured wind.
	expect(asked.some((u) => u.includes('/data/point.json?lat=42.3&lon=9.15'))).toBe(true);
	expect(asked.filter((u) => u.includes('42.306') || u.includes('9.149'))).toEqual([]);
	expect(errors).toEqual([]);
});

test('a surf spot: the verdicts of its activities and its tide', async ({ page }) => {
	const errors = collectErrors(page);
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto('/widget?size=medium&theme=light&spot=tv-hossegor');
	await expect(page.getByText(/Bon|Possible|Déconseillé/).first()).toBeVisible();
	await expect(page.getByText('Règles de Vigie, pas pour la sécurité')).toBeVisible();
	expect(await overflow(page)).toBe(0);
	expect(errors).toEqual([]);
});

for (const [size, [width, height]] of Object.entries(SIZES)) {
	for (const theme of ['sky', 'dark', 'light']) {
		test(`the ${size} widget in the ${theme} theme holds in its frame`, async ({ page }) => {
			const errors = collectErrors(page);
			await page.setViewportSize({ width, height });
			await page.goto(`/widget?size=${size}&theme=${theme}&spot=tv-hossegor${PLACE}`);
			await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
			await expect(page.getByText('Corte').first()).toBeVisible();
			await expect(page.getByText('Vigilances…')).toHaveCount(0);
			expect(await overflow(page)).toBe(0);
			expect(errors).toEqual([]);
		});
	}
}

// What the Windows widgets board gives a web widget: a large one measured at 300 × 462 on screens at 150 % and 250 %, a
// medium one 300 × 304 by Microsoft's documentation; the board writes the widget's name over the top 48 pixels.
for (const [size, height] of [
	['medium', 304],
	['large', 462]
] as const) {
	test(`in the widgets board, the ${size} widget leaves the band of the name empty and hides what does not fit, whole`, async ({
		page
	}) => {
		const errors = collectErrors(page);
		await page.setViewportSize({ width: 300, height });
		await page.goto(`/widget?size=${size}&frame=board&spot=tv-hossegor${PLACE}`);
		await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
		await expect(page.getByText('Corte').first()).toBeVisible();
		await expect(page.getByText('Vigilances…')).toHaveCount(0);
		await expect.poll(() => overflow(page)).toBe(0);
		const top = await page.locator('.widget > *').first().boundingBox();
		expect(top?.y ?? 0).toBeGreaterThanOrEqual(48);
		// Every part left is whole: none ends below the frame.
		const bottoms = await page
			.locator('.widget > *, .widget section')
			.evaluateAll((all) =>
				all.filter((e) => e.getClientRects().length > 0).map((e) => e.getBoundingClientRect().bottom)
			);
		expect(Math.max(...bottoms)).toBeLessThanOrEqual(height);
		expect(errors).toEqual([]);
	});
}

test('in the widgets board, a medium widget given the frame of a large one shows the large layout', async ({
	page
}) => {
	// Measured in November 2026: the board gave a medium web widget 300 × 462, as for a large one.
	await page.setViewportSize({ width: 300, height: 462 });
	await page.goto(`/widget?size=medium&frame=board&spot=tv-hossegor${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.locator('.widget')).toHaveClass(/\blarge\b/);
	await expect(page.locator('.spot-rows')).toBeVisible();
	await expect.poll(() => overflow(page)).toBe(0);
	// Without the board, the size asked is the size shown.
	await page.goto(`/widget?size=medium&spot=tv-hossegor${PLACE}`);
	await expect(page.locator('.widget')).toHaveClass(/\bmedium\b/);
});

test('a part that does not fit goes whole, the five days before the spot', async ({ page }) => {
	await page.setViewportSize({ width: 300, height: 462 });
	await page.goto(`/widget?size=large&frame=board&spot=tv-hossegor${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	await expect.poll(() => overflow(page)).toBe(0);
	await expect(page.locator('.spot-rows')).toBeVisible();
	await expect(page.locator('.days[data-dropped]')).toHaveCount(await page.locator('.days').count());
	// Given the height of the large size and the band of the name, it hides nothing any more.
	await page.setViewportSize({ width: SIZES.large[0], height: SIZES.large[1] + 48 });
	await expect.poll(() => page.locator('[data-dropped]').count()).toBe(0);
	expect(await overflow(page)).toBe(0);
});

test('the desktop app that hosts the page gets a summary of it', async ({ page }) => {
	// What WebView2 gives a page it shows: `window.chrome.webview.postMessage`.
	await page.addInitScript(() => {
		const got: unknown[] = [];
		(window as unknown as { __got: unknown[] }).__got = got;
		(window as unknown as { chrome: unknown }).chrome = {
			webview: { postMessage: (m: unknown) => got.push(m) }
		};
	});
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto(`/widget?size=small&spot=tv-hossegor${PLACE}`);
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __got: { ready: boolean }[] }).__got.some((m) => m.ready))
		)
		.toBe(true);
	const last = await page.evaluate(() => {
		const got = (window as unknown as { __got: { ready: boolean }[] }).__got;
		return got.filter((m) => m.ready).at(-1);
	});
	expect(last).toMatchObject({
		type: 'vigie-summary',
		name: 'Corte',
		tempC: 16.6,
		rain: { status: 'unknown' },
		spot: { name: expect.any(String) }
	});
});

// The mock API answers a spot `<id>--slow-<tag>` 2.5 s late, as the public one did on a quiet morning: the Windows widgets board
// shows only a spinner until the page has come, so the page does not wait for it. A new tag for each run: the site keeps a spot
// read in its cache.
const slowSpot = () => `tv-hossegor--slow-${Date.now().toString(36)}`;

test('a spot the API is slow to read does not hold the page: the place first, the spot when it comes', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.addInitScript(() => {
		const got: unknown[] = [];
		(window as unknown as { __got: unknown[] }).__got = got;
		(window as unknown as { chrome: unknown }).chrome = {
			webview: { postMessage: (m: unknown) => got.push(m) }
		};
	});
	await page.setViewportSize({ width: SIZES.large[0], height: SIZES.large[1] + 48 });
	await page.goto(`/widget?size=large&frame=board&spot=${slowSpot()}${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('17°')).toBeVisible();
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	// The place is there and the spot is not yet: the page did not wait for it.
	await expect(page.locator('.spot-rows')).toHaveCount(0);
	await expect(page.locator('.spot-rows')).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => overflow(page)).toBe(0);
	// While the spot was coming, the app got no summary it could take as final: one without the spot would read as the spot gone.
	const got = await page.evaluate(
		() => (window as unknown as { __got: { ready: boolean; spot: unknown }[] }).__got
	);
	expect(got.some((m) => m.ready)).toBe(true);
	expect(got.filter((m) => m.ready && m.spot == null)).toEqual([]);
	expect(errors).toEqual([]);
});

test('a spot alone, slow to read, says it is coming, then shows its verdicts', async ({ page }) => {
	const errors = collectErrors(page);
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto(`/widget?size=medium&spot=${slowSpot()}`);
	await expect(page.getByText('Spot…')).toBeVisible();
	await expect(page.getByText(/Bon|Possible|Déconseillé/).first()).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText('Spot…')).toHaveCount(0);
	expect(await overflow(page)).toBe(0);
	expect(errors).toEqual([]);
});

test('without a place nor a spot, the widget says what to do', async ({ page }) => {
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto('/widget?size=small');
	await expect(page.getByText('Aucun lieu choisi')).toBeVisible();
	await page.goto('/widget?size=small&spot=nowhere-at-all');
	await expect(page.getByText('Spot inconnu')).toBeVisible();
});
