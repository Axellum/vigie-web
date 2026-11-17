import { expect, test, type Page } from '@playwright/test';

// The offshore buoys (`/sea/buoys`): the answer of the API is e2e/fixtures/sea-buoys.json, 10 buoys of Météo-France recorded on
// 2026-11-16 at 22:00 UTC (23:00 in Paris).
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('the buoys say they are measures out at sea, grouped by sea, waves first', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/sea/buoys');
	await expect(page).toHaveTitle(/Bouées au large/);
	await expect(page.getByRole('heading', { level: 1, name: 'Les bouées au large' })).toBeVisible();
	await expect(page.getByText('Des mesures, pas une prévision', { exact: false })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2 })).toHaveText([
		'Méditerranée',
		'Atlantique',
		'Outre-mer'
	]);

	const gascogne = page.getByRole('listitem').filter({ hasText: 'Bouée Gascogne' });
	await expect(gascogne).toContainText('4 m');
	await expect(gascogne).toContainText('période 7 s · de OSO');
	await expect(gascogne).toContainText('17 °C');
	await expect(gascogne).toContainText('58 km/h de SO · rafales 76 km/h');
	await expect(gascogne).toContainText(/1\s001 hPa/); // 1000.5 hPa, rounded
	await expect(gascogne).toContainText('mesuré à 23:00');
	// Sardinia measured no wave: the page says so, nothing is made up.
	await expect(page.getByRole('listitem').filter({ hasText: 'Bouée Sardaigne' })).toContainText(
		'pas de mesure des vagues'
	);
	await expect(page.getByText('Source: Météo-France', { exact: false })).toBeAttached(); // in the folded credits
	expect(await fits(page)).toBe(true);
	expect(errors).toEqual([]);
});

test('the page of the sea links to the buoys, and the buoys page fits a phone', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto('/sea/buoys');
	expect(await fits(page)).toBe(true);
	await page.goto('/sea/surf');
	await expect(page.getByRole('link', { name: /Les bouées au large/ })).toHaveAttribute('href', '/sea/buoys');
});
