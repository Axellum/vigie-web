import { expect, test, type Page } from '@playwright/test';

// The screens for televisions (/tv): a page of the site that is set by its address, shows by itself and is read by a browser of 2018.
// The data are the recorded ones of a spot of the mock API (tv-hossegor), moved to the day the test runs.
const SPOT = '/tv?spot=tv-hossegor';

test.skip(
	({ isMobile }) => isMobile,
	'a television is not a phone: the desktop project is the one that runs these'
);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

// What spills out of its card or its band, in the panel on show (a panel that overflows is a panel cut off on the wall).
async function layoutProblems(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const problems: string[] = [];
		const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const frame = rect('.tv-frame');
		const foot = rect('.tv-foot');
		const panels = rect('#tv-panels');
		const text = rect('.tv-foot-text');
		const corner = rect('.tv-panel.tv-on .tv-corner');
		const place = rect('.tv-place');
		const rain = rect('#tv-rain');
		const when = rect('.tv-when');
		if (!place || !rain || !when) return ['the head lacks its place, its rain or its clock'];
		if (rain.left < place.right)
			problems.push(`the rain (${rain.left}) runs into the place (${place.right})`);
		if (rain.right > when.left) problems.push(`the rain (${rain.right}) runs into the clock (${when.left})`);
		if (!frame || !foot || !panels || !text) return ['the frame, the panels or the foot are missing'];
		if (panels.bottom > foot.top + 1)
			problems.push(`the panels (${panels.bottom}) run into the foot (${foot.top})`);
		if (foot.bottom > frame.bottom + 1) problems.push('the foot leaves the frame');
		if (
			corner &&
			corner.left < text.right &&
			corner.right > text.left &&
			corner.top < text.bottom &&
			corner.bottom > text.top
		) {
			problems.push('the QR code covers the credits');
		}
		document.querySelectorAll('.tv-panel.tv-on .tv-card').forEach((el) => {
			const name = `${el.className} ${el.textContent?.trim().slice(0, 24)}`;
			if (el.scrollHeight > el.clientHeight + 1)
				problems.push(`${name}: ${el.scrollHeight} > ${el.clientHeight} high`);
			if (el.scrollWidth > el.clientWidth + 1)
				problems.push(`${name}: ${el.scrollWidth} > ${el.clientWidth} wide`);
		});
		return problems;
	});
}

test('a screen shows the place, the clock, the figures, the credits and the warning, and no part of the site around it', async ({
	page,
	request
}) => {
	const errors = collectErrors(page);
	const answer = await page.goto(SPOT);
	expect(answer?.headers()['x-robots-tag']).toContain('noindex');
	expect(answer?.headers()['cache-control']).toContain('no-cache');
	const root = page.locator('#tv-root');
	await expect(root).toHaveAttribute('data-state', 'screen');
	await expect(page.locator('.tv-place')).toHaveText('Soorts-Hossegor');
	await expect(page.locator('#tv-clock')).toHaveText(/^\d\d:\d\d$/);
	await expect(page.getByText('nœuds', { exact: true }).first()).toBeVisible();
	// The rain of the hour is in the head, whatever the panel: the recorded hour is dry, and it says it is a forecast.
	await expect(page.locator('#tv-rain')).toContainText('Pluie dans l’heure');
	await expect(page.locator('#tv-rain')).toContainText('prévision');
	await expect(page.locator('#tv-rain .tv-rain-word')).toHaveText('aucune');
	await expect(page.locator('#tv-rain .tv-rain-bar')).toHaveCount(4);
	// The credits and the warning are always there: a television cannot follow a link to them.
	await expect(page.locator('.tv-foot-text')).toContainText('Ne remplace pas les avis officiels');
	await expect(page.locator('.tv-foot-text')).toContainText('Open-Meteo');
	await expect(page.locator('.tv-panel.tv-on .tv-qr')).toHaveCount(1);
	// Nothing to click: no navigation, no button, no link of the site around it.
	await expect(page.locator('.skip, nav:visible, .top:visible, .notice:visible, .foot:visible')).toHaveCount(
		0
	);
	await expect(page.locator('#tv-root a, #tv-root button, #tv-root input')).toHaveCount(0);
	// The script comes from the site, written once and kept for good under an address that carries its version.
	const script = await request.get(
		await page
			.locator('script[src^="/tv/screen.js"]')
			.getAttribute('src')
			.then((s) => s ?? '')
	);
	expect(script.headers()['content-type']).toContain('javascript');
	expect(script.headers()['cache-control']).toMatch(/immutable/);
	expect(errors).toEqual([]);
});

for (const [preset, heading] of [
	['port', 'BATEAU'],
	['club', 'HOULE'],
	['shop', 'CONDITIONS DU JOUR']
] as const) {
	test(`the ${preset} preset shows its own instruments, at three sizes, with nothing cut off`, async ({
		page
	}) => {
		for (const [width, height] of [
			[1280, 720],
			[1920, 1080],
			[3840, 2160]
		]) {
			await page.setViewportSize({ width, height });
			for (const panel of ['cadran', 'verdicts']) {
				await page.goto(`${SPOT}&preset=${preset}&panels=${panel}`);
				await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
				const frame = await page.locator('.tv-frame').boundingBox();
				expect(frame?.width, `${preset} ${panel} ${width}`).toBeCloseTo(width, 0);
				expect(frame?.height, `${preset} ${panel} ${width}`).toBeCloseTo(height, 0);
				expect(await layoutProblems(page), `${preset} ${panel} ${width}×${height}`).toEqual([]);
			}
		}
		await page.goto(`${SPOT}&preset=${preset}&panels=cadran`);
		const text = await page.locator('.tv-panel.tv-on').innerText();
		expect(text.toUpperCase()).toContain(heading);
	});
}

test('the panels take turns by themselves, and the first stays when there is only one', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`${SPOT}&d=5`);
	const on = page.locator('.tv-panel.tv-on');
	await expect(on).toHaveAttribute('data-panel', 'cadran');
	await expect(page.locator('.tv-dot-on')).toHaveCount(1);
	await page.clock.runFor(5_500);
	await expect(on).toHaveAttribute('data-panel', 'verdicts');
	await page.clock.runFor(5_000);
	await expect(on).toHaveAttribute('data-panel', 'cadran');
	await page.goto(`${SPOT}&d=5&panels=verdicts`);
	await expect(page.locator('#tv-dots')).toHaveCount(0);
	await page.clock.runFor(30_000);
	await expect(page.locator('.tv-panel.tv-on')).toHaveAttribute('data-panel', 'verdicts');
});

test('the clock runs, the theme follows the address and the screen is moved a little now and then', async ({
	page
}) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`${SPOT}&theme=night`);
	await expect(page.locator('#tv-root')).toHaveClass(/tv-night/);
	await page.goto(`${SPOT}&theme=day`);
	await expect(page.locator('#tv-root')).toHaveClass(/tv-day/);
	const before = await page.locator('#tv-clock').innerText();
	await page.clock.runFor(120_000 + 1_000);
	const after = await page.locator('#tv-clock').innerText();
	expect(after).not.toBe(before);
	// Against the burn-in of a panel left on for months: the stage is moved by a few pixels, never out of the frame.
	const shift = await page.locator('#tv-shift').evaluate((el) => (el as HTMLElement).style.transform);
	expect(shift).toMatch(/^translate\(-?\d+px, ?-?\d+px\)$/);
});

test('when the site does not answer, the screen stays and says it, then forgets it when the site is back', async ({
	page
}) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`${SPOT}&r=60`);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
	const banner = page.locator('#tv-banner');
	await expect(banner).not.toHaveClass(/tv-banner-on/);
	const place = await page.locator('.tv-place').innerText();

	const down = (url: URL) => url.pathname === '/tv';
	await page.route(down, (route) => route.abort());
	await page.clock.runFor(70_000);
	await expect(banner).toHaveClass(/tv-banner-on/);
	await expect(banner).toContainText('hors ligne, dernière mise à jour');
	await expect(page.locator('.tv-place')).toHaveText(place);
	await expect(page.locator('#tv-clock')).toHaveText(/^\d\d:\d\d$/);

	await page.unroute(down);
	await page.clock.runFor(70_000);
	await expect(banner).not.toHaveClass(/tv-banner-on/);
	await expect(page.locator('.tv-place')).toHaveText(place);
});

test('with no place, or an unknown one, the screen says it and lists the places; it never shows an error page', async ({
	page
}) => {
	await page.goto('/tv');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'choose');
	await expect(page.getByText('Choisir un lieu')).toBeVisible();
	const links = page.locator('.tv-spots a');
	expect(await links.count()).toBeGreaterThan(5);
	await expect(links.first()).toHaveAttribute('href', /^\/tv\?spot=[a-z0-9-]+$/);
	await page.goto('/tv?spot=no-such-place');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'unknown');
	await expect(page.getByText('Ce lieu n’existe pas dans Vigie')).toBeVisible();
	await expect(page.locator('.tv-foot-text')).toContainText('Ne remplace pas les avis officiels');
	// A value that makes no sense is a default, not an error.
	await page.goto(`${SPOT}&preset=nonsense&d=0&r=1&theme=x&panels=nope`);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-seconds', '5');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-refresh', '60');
});

test('the screen speaks English when asked', async ({ page }) => {
	await page.goto(`${SPOT}&lang=en`);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-lang', 'en');
	await expect(page.getByText('knots', { exact: true }).first()).toBeVisible();
	await expect(page.locator('#tv-rain')).toContainText('Rain in the hour');
	await expect(page.locator('#tv-rain .tv-rain-word')).toHaveText('none');
	await expect(page.locator('.tv-foot-text')).toContainText('Does not replace official warnings');
});

test('the stylesheet that is served to the television has nothing a browser of 2018 does not know', async ({
	page,
	request
}) => {
	const html = await (await request.get(SPOT)).text();
	const hrefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(
		(m) => new URL(m[1], 'http://localhost/tv').pathname
	);
	const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
	const sheets = [...inline];
	for (const href of hrefs) {
		const answer = await request.get(href.startsWith('/') ? href : `/${href}`);
		if (answer.ok()) sheets.push(await answer.text());
	}
	const tv = sheets.filter((s) => s.includes('.tv-frame'));
	expect(tv.length).toBeGreaterThan(0);
	for (const css of tv) {
		for (const [name, pattern] of [
			['gap', /(^|[\s;{,])(row-|column-)?gap\s*:/],
			['grid', /display\s*:\s*(inline-)?grid/],
			['inset', /(^|[\s;{])inset\s*:/],
			['clamp, min or max', /(^|[^-\w])(clamp|min|max)\(/],
			['aspect-ratio', /aspect-ratio/],
			// What the minifier makes of the source: `transparent` and zero alpha become `#0000`, four sides become `inset`.
			['#rgba and #rrggbbaa', /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{4})(?![0-9a-fA-F])/],
			['rgb() with spaces', /rgba?\(\s*[\d.%]+\s+[\d.%]+/],
			[':is, :where', /:(is|where)\(/]
		] as const) {
			// Only the rules of the screen: the stylesheet of the site, which this page also loads, is for the browsers of today.
			const rules = css.split('}').filter((r) => /\.tv-/.test(r.split('{')[0]));
			const hit = rules.find((r) => pattern.test(r));
			expect(hit ?? null, name).toBeNull();
		}
	}
});
