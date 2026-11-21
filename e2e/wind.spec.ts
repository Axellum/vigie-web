import { expect, test, type Page } from '@playwright/test';

// The measured wind on the map (`GET /v1/stations/wind` of the API, e2e/fixtures/stations-wind.json: the 687 stations of
// metropolitan France recorded on 2026-11-21 at 23:12, Paris time; plus the offshore buoys of e2e/fixtures/sea-buoys.json).
// Off until the visitor turns it on; the choice and the unit are kept in the browser.
const at = '23:12';

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected when the map moves over it (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const card = (page: Page) => page.getByTestId('wind-card');
const badges = (page: Page) => page.getByTestId('wind-badge');
const toggle = (page: Page) => page.getByTestId('wind-toggle');
const open = async (page: Page) => {
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
};

test('the wind is off at first, then badges over France, strongest kept, with a card and a popup', async ({
	page
}) => {
	const errors = collectErrors(page);
	await open(page);
	await expect(toggle(page)).not.toBeChecked();
	await expect(card(page)).toHaveCount(0);
	await expect(badges(page)).toHaveCount(0);

	await page.getByRole('button', { name: 'France', exact: true }).click();
	await toggle(page).check();
	await expect(card(page)).toBeVisible();
	await expect(card(page)).toContainText(`Vent mesuré · ${at}`, { timeout: 15_000 });

	// Badges that would touch are left out: fewer than the 687 stations, but many, and the strongest is always there.
	await expect.poll(async () => badges(page).count(), { timeout: 15_000 }).toBeGreaterThan(60);
	expect(await badges(page).count()).toBeLessThan(687);
	const ouessant = page.getByRole('button', {
		name: /^Ouessant-Stiff : Vent 58 km\/h de SE, Rafales 73 km\/h$/
	});
	await expect(ouessant).toHaveCount(1);
	await expect(ouessant).toContainText('58'); // the mean on the badge
	await expect(ouessant.locator('.gust')).toHaveText('73'); // the gust, 15 km/h above the mean or more
	// A buoy is a square.
	await expect(page.locator('[data-testid="wind-badge"] svg rect').first()).toBeAttached();

	await ouessant.click();
	const popup = page.locator('.vigie-wind-popup');
	await expect(popup).toContainText('Ouessant-Stiff');
	await expect(popup).toContainText('Vent 58 km/h de SE');
	await expect(popup).toContainText('Rafales 73 km/h');
	await expect(popup).toContainText(`Station à 64 m · mesure de ${at}`);
	expect(errors).toEqual([]);
});

test('knots and "on" are kept for the next visit; the card turns the wind off', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: 'France', exact: true }).click();
	await toggle(page).check();
	await card(page).getByRole('button', { name: 'nœuds' }).click();
	await expect(card(page).getByRole('button', { name: 'nœuds' })).toHaveAttribute('aria-pressed', 'true');
	const ouessant = page.getByRole('button', { name: /^Ouessant-Stiff : Vent 31 nœuds de SE/ });
	await expect(ouessant).toHaveCount(1, { timeout: 15_000 });

	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await expect(toggle(page)).toBeChecked();
	await expect(card(page).getByRole('button', { name: 'nœuds' })).toHaveAttribute('aria-pressed', 'true');

	await card(page).getByRole('button', { name: 'Masquer le vent' }).click();
	await expect(toggle(page)).not.toBeChecked();
	await expect(card(page)).toHaveCount(0);
	await expect(badges(page)).toHaveCount(0);
});
