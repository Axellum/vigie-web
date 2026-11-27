import { expect, test } from '@playwright/test';

// The style of the base map comes from the site with the address of its tiles written in: the map asks OpenFreeMap for
// tiles (and glyphs, sprites), never for its style nor for the description of its tiles, and the connection to it is
// opened by the page.
test('the map takes its style from the site and asks OpenFreeMap for its tiles only', async ({ page }) => {
	const asked: string[] = [];
	page.on('request', (request) => asked.push(request.url()));
	await page.goto('/');
	await expect(
		page.locator('link[rel="preconnect"][href="https://tiles.openfreemap.org"]').first()
	).toHaveAttribute('crossorigin', 'anonymous');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	// The tiles are those the description of OpenFreeMap lists: its planet, or its backup copy while it makes a new one
	// (`backup_planet/`, seen on 27 November 2026).
	await expect
		.poll(() =>
			asked.some((url) =>
				/^https:\/\/tiles\.openfreemap\.org\/(?:backup_)?planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/.test(url)
			)
		)
		.toBe(true);
	expect(asked.filter((url) => /\/data\/basemap\/(light|dark)\.json$/.test(url))).toHaveLength(1);
	expect(asked.filter((url) => /tiles\.openfreemap\.org\/(styles\/|planet$)/.test(url))).toEqual([]);
});
