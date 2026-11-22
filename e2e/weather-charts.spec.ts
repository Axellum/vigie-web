import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const noOverflow = async (page: Page) =>
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
	).toBeLessThanOrEqual(0);

for (const width of [375, 1280]) {
	test(`all weather chart tabs render cleanly without overflow at ${width} px`, async ({ page }) => {
		const errors = collectErrors(page);
		await page.setViewportSize({ width, height: 812 });
		await page.goto('/near#42.306,9.15,300');

		const weather = page.getByRole('region', { name: 'Météo', exact: true });
		await weather.getByText('Détail').click();

		const charts = weather.getByTestId('weather-charts');
		await expect(charts).toBeVisible({ timeout: 15_000 });

		// Default tab: Meteogram
		await expect(charts.getByTestId('chart-meteogram')).toBeVisible();
		await expect(charts.locator('svg').first()).toBeVisible();
		await noOverflow(page);

		// Barometer tab
		await charts.getByTestId('wc-tab-barometer').click();
		await expect(charts.getByTestId('chart-barometer')).toBeVisible();
		await expect(charts.getByTestId('pressure-trend')).toBeVisible();
		await noOverflow(page);

		// UV & Solar tab
		await charts.getByTestId('wc-tab-uv').click();
		await expect(charts.getByTestId('chart-uv')).toBeVisible();
		await expect(charts.getByTestId('chart-uv')).toContainText('W/m²');
		await noOverflow(page);

		// Air Quality tab
		await charts.getByTestId('wc-tab-air').click();
		await expect(charts.getByTestId('chart-air')).toBeVisible();
		await expect(charts.getByTestId('chart-air')).toContainText('EAQI');
		await noOverflow(page);

		// Forecast vs Measured tab (nearest Corsica station from cached wind map)
		await expect(charts.getByTestId('wc-tab-compare')).toBeVisible({ timeout: 10_000 });
		await charts.getByTestId('wc-tab-compare').click();
		await expect(charts.getByTestId('chart-compare')).toBeVisible();
		await expect(charts.getByTestId('chart-compare')).toContainText(/km/);
		await noOverflow(page);

		expect(errors).toEqual([]);
	});
}

test('English labels and graceful hiding when hourly/air/measured data are null', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/near?lang=en#42.306,9.15,300');
	const weather = page.getByRole('region', { name: 'Weather', exact: true });
	await weather.getByText('Detail').click();
	const charts = weather.getByTestId('weather-charts');
	await expect(charts).toBeVisible({ timeout: 15_000 });
	await expect(charts.getByRole('tab', { name: 'Meteogram' })).toBeVisible();
	await expect(charts.getByRole('tab', { name: 'Barometer' })).toBeVisible();
	await expect(charts.getByRole('tab', { name: 'UV & Solar' })).toBeVisible();
	await expect(charts.getByRole('tab', { name: 'Air quality' })).toBeVisible();

	// Far south coordinates: mock API returns null for hourly, pressure_history and air_hourly, and no station is nearby.
	await page.goto('/near?lang=en#-54.8,-68.3,300');
	const south = page.getByRole('region', { name: 'Weather', exact: true });
	await south.getByText('Detail').click();
	await expect(south.getByText('Next days')).toBeVisible({ timeout: 15_000 });
	await expect(south.getByTestId('weather-charts')).toHaveCount(0);
	expect(errors).toEqual([]);
});
