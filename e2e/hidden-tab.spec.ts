import { expect, test, type Page } from '@playwright/test';

// The map asks the site again every minute (the list of hazards) only while the tab is on screen. A tab in the background
// sends nothing; back on screen, the list is asked at once when it is older than a minute.
const HAZARDS = '**/data/hazards.json';

/** Make the page believe it is hidden (or visible again), as a browser does for a tab in the background. */
async function setHidden(page: Page, hidden: boolean) {
	await page.evaluate((h) => {
		Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => (h ? 'hidden' : 'visible')
		});
		document.dispatchEvent(new Event('visibilitychange'));
	}, hidden);
}

test('the map sends nothing while the tab is hidden and asks again at once on the return', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	let asked = 0;
	await page.route(HAZARDS, (route) => {
		asked++;
		return route.continue();
	});
	await page.clock.install();
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	expect(asked).toBe(0);

	// Visible: the list comes back after a minute.
	await page.clock.fastForward(61_000);
	await expect.poll(() => asked).toBe(1);

	// Hidden: five minutes go by and nothing is sent.
	await setHidden(page, true);
	await page.clock.fastForward(300_000);
	await page.waitForTimeout(500);
	expect(asked).toBe(1);

	// Back on screen: one request at once, without waiting for the next minute.
	await setHidden(page, false);
	await expect.poll(() => asked).toBe(2);
	expect(errors).toEqual([]);
});
