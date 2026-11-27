import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The widget page (/widget), which a desktop app shows in a panel a few hundred pixels wide: a place after the `#`, a surf spot in
// the query. The small widget is the frise (FriseView), the medium and large ones the Home Assistant card's home page drawn
// smaller (CardWidget). The data are the recorded ones of the mock API: the weather of a point in Corsica, the warnings of France,
// the television spot of Hossegor. The sizes are the whole frames of the Windows widgets board, the app asking it for no title
// band (`frame=bare`).
const PLACE = '#42.306,9.149/Corte';
const SIZES = { small: [300, 146], medium: [300, 303], large: [300, 462] } as const;

// The site's service worker fetches for the pages it controls, out of reach of `page.route` (asFrance, below): blocked here.
test.use({ serviceWorkers: 'block' });

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
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto(`/widget?size=small&frame=bare${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('Corte')).toBeVisible();
	await expect(page.getByText('17°')).toBeVisible();
	// The recorded weather is weeks old: the rain of the hour is not told from it.
	await expect(page.getByText('Pluie de l’heure non lue')).toBeVisible();
	// The warning under the place, discreet: its words, or the quiet ones.
	await expect(page.locator('.who .warn, .who .quiet').first()).toBeVisible();
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	expect(await overflow(page)).toBe(0);
	// Only the cell of the grid goes to the server, for the weather and the measured wind.
	expect(asked.some((u) => u.includes('/data/point.json?lat=42.3&lon=9.15'))).toBe(true);
	expect(asked.filter((u) => u.includes('42.306') || u.includes('9.149'))).toEqual([]);
	expect(errors).toEqual([]);
});

// With the clock at the time of the recorded answer, its hours and days are still to come and its rain of the hour is fresh.
const RECORDED_AT = (
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'point.json'), 'utf-8')) as {
		server_utc: number;
	}
).server_utc;

test('the frise: the box of the next hour, then the next hours or the days from tomorrow, and the sentence of the rain', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.clock.setFixedTime(new Date((RECORDED_AT + 60) * 1000));
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto(`/widget?size=small&theme=light&frame=bare${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.locator('.band .hour')).toContainText('+1 h');
	await expect(page.locator('.band .hour .bars i')).not.toHaveCount(0);
	await expect(page.locator('.band .draw svg rect[fill^="url(#"]')).toHaveCount(5);
	await expect(page.locator('.say')).toContainText('Pas de pluie');
	// The recorded warnings hold Corsica: their words in the colour of their level, no pill.
	await expect(page.locator('.who .warn')).toContainText('Crues, inondations');
	await expect(page.locator('.pill')).toHaveCount(0);
	expect(await overflow(page)).toBe(0);
	// Nothing goes out at the side: the sentence of the rain fits, and the top row leaves the board's « ··· » alone.
	expect(await page.locator('.say').evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
	const right = await page
		.locator('.top .who > *')
		.evaluateAll((all) => Math.max(...all.map((e) => e.getBoundingClientRect().right)));
	expect(right).toBeLessThanOrEqual(300 - 12 - 30);

	await page.goto(`/widget?size=small&theme=dark&frame=bare&fc=days${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	// As many days as the recorded answer has after today (at most five).
	await expect
		.poll(() => page.locator('.band .draw svg rect[fill^="url(#"]').count())
		.toBeGreaterThanOrEqual(2);
	// The box is « now »: the days start tomorrow.
	await expect(page.locator('.band .draw')).not.toContainText('Auj.');
	expect(await overflow(page)).toBe(0);
	expect(errors).toEqual([]);
});

/**
 * The recorded answer is Open-Meteo's, with which the card draws no home page of France (its rule: Météo-France's forecast); named
 * Météo-France's here, it does.
 */
const asFrance = (page: Page) =>
	page.route('**/data/card.json*', async (route) => {
		const response = await route.fetch();
		const body = (await response.json()) as { point: Record<string, unknown> };
		body.point = { ...body.point, weather_provider: 'Météo-France (test)' };
		await route.fulfill({ response, json: body });
	});

/** The card's page: how much of it is below its height, and which of its parts show. */
const cardPage = (page: Page) =>
	page.locator('vigie-card').evaluate((c) => {
		const root = c.shadowRoot!;
		const p = root.querySelector('.page') as HTMLElement;
		const shows = (sel: string) => [...root.querySelectorAll(sel)].some((e) => e.getClientRects().length > 0);
		return {
			over: p.scrollHeight - p.clientHeight,
			hours: shows('.pile > .bloc:has(.hr)'),
			days: shows('.pile > .bloc:has(.dh)'),
			facts: shows('.now-f'),
			name: shows('.entete'),
			height: Math.round(c.getBoundingClientRect().height)
		};
	});

test('the medium and large widgets are the card: the medium one with the hours or the days chosen in the app', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => asked.push(r.url()));
	await asFrance(page);
	await page.clock.setFixedTime(new Date((RECORDED_AT + 60) * 1000));
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto(`/widget?size=medium&theme=dark&frame=bare${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.locator('vigie-card')).toHaveCount(1);
	await expect.poll(async () => (await cardPage(page)).hours).toBe(true);
	expect(await cardPage(page)).toMatchObject({
		days: false,
		facts: false,
		name: false,
		height: SIZES.medium[1]
	});
	expect(await overflow(page)).toBe(0);

	await page.goto(`/widget?size=medium&theme=sky&frame=bare&fc=days${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect.poll(async () => (await cardPage(page)).days).toBe(true);
	expect(await cardPage(page)).toMatchObject({ hours: false, facts: false });

	await page.setViewportSize({ width: SIZES.large[0], height: SIZES.large[1] });
	await page.goto(`/widget?size=large&theme=light&frame=bare${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect.poll(async () => (await cardPage(page)).days).toBe(true);
	expect(await cardPage(page)).toMatchObject({ hours: true, name: false, height: SIZES.large[1] });
	// The whole answer of the cell for the card; never the exact position.
	expect(asked.some((u) => u.includes('/data/card.json?lat=42.3&lon=9.15'))).toBe(true);
	expect(asked.filter((u) => u.includes('42.306') || u.includes('9.149'))).toEqual([]);
	expect(errors).toEqual([]);
});
test('where the card draws no home page of France, the medium and large widgets are the frise, larger, the large one with the days', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.clock.setFixedTime(new Date((RECORDED_AT + 60) * 1000));
	for (const size of ['medium', 'large'] as const) {
		await page.setViewportSize({ width: SIZES[size][0], height: SIZES[size][1] });
		await page.goto(`/widget?size=${size}&frame=bare${PLACE}`);
		await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
		await expect(page.locator('vigie-card')).toHaveCount(0);
		await expect(page.locator('.band .draw svg rect[fill^="url(#"]')).toHaveCount(5);
		await expect(page.getByText('Corte')).toBeVisible();
		// The large one adds the days, from today, under the sentence of the rain.
		if (size === 'large')
			await expect
				.poll(() => page.locator('.draw.days svg rect[fill^="url(#"]').count())
				.toBeGreaterThanOrEqual(2);
		else await expect(page.locator('.draw.days')).toHaveCount(0);
		expect(await overflow(page)).toBe(0);
	}
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
			if (size !== 'small') await asFrance(page);
			await page.goto(`/widget?size=${size}&theme=${theme}&frame=bare&spot=tv-hossegor${PLACE}`);
			await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
			if (size === 'small') await expect(page.getByText('Corte').first()).toBeVisible();
			else await expect(page.locator('vigie-card .pile').first()).toBeVisible();
			await expect(page.getByText('Vigilances…')).toHaveCount(0);
			expect(await overflow(page)).toBe(0);
			expect(errors).toEqual([]);
		});
	}
}

// The app of an older version still asks for the band of the board's title (`frame=board`): the card leaves its top 48 pixels
// empty. The board does not always give the size asked: a medium web widget was given 300 × 462, the frame of a large one.
for (const [size, height] of [
	['medium', 304],
	['large', 462]
] as const) {
	test(`in the widgets board with its title band, the ${size} card leaves the band empty`, async ({
		page
	}) => {
		const errors = collectErrors(page);
		await asFrance(page);
		await page.clock.setFixedTime(new Date((RECORDED_AT + 60) * 1000));
		await page.setViewportSize({ width: 300, height });
		await page.goto(`/widget?size=${size}&frame=board${PLACE}`);
		await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
		const first = page.locator('vigie-card .pile > *').first();
		await expect(first).toBeVisible();
		expect((await first.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(48);
		expect(await overflow(page)).toBe(0);
		expect(errors).toEqual([]);
	});
}

test('in the widgets board, a medium widget given the frame of a large one shows the large layout', async ({
	page
}) => {
	await page.setViewportSize({ width: 300, height: 462 });
	await page.goto(`/widget?size=medium&frame=bare${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.locator('.widget')).toHaveClass(/\blarge\b/);
	// Without the board, the size asked is the size shown.
	await page.goto(`/widget?size=medium${PLACE}`);
	await expect(page.locator('.widget')).toHaveClass(/\bmedium\b/);
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
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto(`/widget?size=small&frame=bare&spot=${slowSpot()}${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('17°')).toBeVisible();
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	// The place is there before the spot: the page did not wait for it. The spot comes in the summary for the app.
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					(window as unknown as { __got: { ready: boolean; spot: unknown }[] }).__got.some(
						(m) => m.ready && m.spot != null
					)
				),
			{ timeout: 10_000 }
		)
		.toBe(true);
	expect(await overflow(page)).toBe(0);
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

// The home face (`face=home`): the Home Assistant card of vigie-api itself, at its size, which the Windows app shows in its flyout.
// The recorded weather of the mock API is Open-Meteo's and weeks old, so the card draws its page for a place outside France; what
// is checked here is the frame: the card is there with the place, nothing scrolls, only the cell of the grid leaves the browser,
// and the desktop app still gets the widget's summary, spot included.
test('the home face: the Home Assistant card with the place, and the summary for the desktop app as before', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => asked.push(r.url()));
	await page.addInitScript(() => {
		const got: unknown[] = [];
		(window as unknown as { __got: unknown[] }).__got = got;
		(window as unknown as { chrome: unknown }).chrome = {
			webview: { postMessage: (m: unknown) => got.push(m) }
		};
	});
	await page.setViewportSize({ width: 480, height: 760 });
	await page.goto(`/widget?face=home&theme=dark&spot=tv-hossegor${PLACE}`);
	await expect(page.locator('.home')).toHaveAttribute('data-ready', 'yes');
	const card = page.locator('vigie-card');
	await expect(card).toHaveCount(1);
	// The card draws in its shadow root: the name of the place in its header, its bar of two pages, on the home page.
	await expect(card.locator('.lieu')).toHaveText('Corte');
	await expect(card.getByRole('tab')).toHaveText(['Accueil', 'Détails']);
	await expect(card.getByRole('tab', { name: 'Accueil' })).toHaveAttribute('aria-selected', 'true');
	expect(await card.evaluate((c) => Math.round(c.getBoundingClientRect().height))).toBe(760);
	// No tooltip of credits over the card (it covered it in the flyout).
	expect(await page.locator('.home').getAttribute('title')).toBeNull();
	expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(
		0
	);
	// The whole answer of the cell first, then the widget's own reading of the same cell; never the exact position.
	expect(asked.some((u) => u.includes('/data/card.json?lat=42.3&lon=9.15'))).toBe(true);
	expect(asked.some((u) => u.includes('/ha-card/vigie-card.js?v='))).toBe(true);
	expect(asked.filter((u) => u.includes('42.306') || u.includes('9.149'))).toEqual([]);
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __got: { ready: boolean }[] }).__got.some((m) => m.ready))
		)
		.toBe(true);
	const last = await page.evaluate(() =>
		(window as unknown as { __got: { ready: boolean }[] }).__got.filter((m) => m.ready).at(-1)
	);
	expect(last).toMatchObject({
		type: 'vigie-summary',
		name: 'Corte',
		tempC: 16.6,
		spot: { name: expect.any(String) }
	});
	expect(errors).toEqual([]);
});

// The Details page of the card, as in Home Assistant: from its bar, and by a swipe from the home page; it scrolls inside the card,
// never the page of the flyout.
test('the home face: the Details page of the card from its bar and by a swipe', async ({ page }) => {
	const errors = collectErrors(page);
	await page.setViewportSize({ width: 480, height: 760 });
	await page.goto(`/widget?face=home&theme=dark${PLACE}`);
	await expect(page.locator('.home')).toHaveAttribute('data-ready', 'yes');
	const card = page.locator('vigie-card');
	const details = card.getByRole('tab', { name: 'Détails' });
	await details.click();
	await expect(details).toHaveAttribute('aria-selected', 'true');
	await expect(card.locator('.page .pile').first()).toBeVisible();
	expect(await card.evaluate((c) => Math.round(c.getBoundingClientRect().height))).toBe(760);
	expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(
		0
	);
	// Back home from the bar, then to Details again by a swipe to the left.
	await card.getByRole('tab', { name: 'Accueil' }).click();
	await expect(card.getByRole('tab', { name: 'Accueil' })).toHaveAttribute('aria-selected', 'true');
	await page.mouse.move(400, 400);
	await page.mouse.down();
	await page.mouse.move(250, 405, { steps: 5 });
	await page.mouse.move(150, 405, { steps: 5 });
	await page.mouse.up();
	await expect(details).toHaveAttribute('aria-selected', 'true');
	expect(errors).toEqual([]);
});

test('the home face without a place asks for one, as the widget does', async ({ page }) => {
	const errors = collectErrors(page);
	await page.setViewportSize({ width: 480, height: 760 });
	await page.goto('/widget?face=home');
	await expect(page.locator('.home')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('Aucun lieu choisi')).toBeVisible();
	await expect(page.locator('vigie-card')).toHaveCount(0);
	expect(errors).toEqual([]);
});
