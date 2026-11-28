import { expect, test, type Page } from '@playwright/test';
import { closeLayers, openLayers } from './layers';

// The weather of the towns on the home map (`/data/towns.json`, read from the API's `/v1/points`; the mock gives the recorded point
// of e2e/fixtures/point.json for every town, moved to today, with rain at the second town and a strong wind at the third). On at
// first; the choice is kept in the browser.

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected when the map moves over it (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const pills = (page: Page) => page.getByTestId('town-pill');
const moments = (page: Page) => page.getByTestId('town-moments');

test('a pill for each town over France, the gist on hover, the whole card on a click, the moments under the map', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop', 'the pointer is a computer one; the phone has its own test');
	const errors = collectErrors(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await page.getByRole('button', { name: 'France', exact: true }).click();

	// The towns the map names, never more than 40, each with the sky and its temperature.
	await expect.poll(async () => pills(page).count(), { timeout: 20_000 }).toBeGreaterThan(5);
	expect(await pills(page).count()).toBeLessThanOrEqual(40);
	const paris = page.locator('[data-testid="town-pill"][data-town="Paris"]');
	await expect(paris).toHaveCount(1);
	await expect(paris).toHaveAccessibleName(/^Paris : -?\d+°/);
	await expect(paris.locator('svg').first()).toBeAttached();
	// A drop with the millimetres where it rains within 3 hours, an arrow with the gust where the wind blows hard.
	await expect(page.locator('[data-testid="town-pill"] .rn').first()).toBeVisible();
	await expect(page.locator('[data-testid="town-pill"] .wd').first()).toContainText('58');
	// The pill writes the town's name under it, in place of the base map's label.
	await expect(paris.locator('.nm')).toHaveText('Paris');

	// The short card under the pointer: now, the next six hours, the day.
	await paris.hover();
	const tip = page.getByTestId('town-tip');
	await expect(tip).toBeVisible();
	await expect(tip).toContainText('Paris');
	await expect(tip).toContainText('maintenant');
	await expect(tip.locator('.hours .col')).toHaveCount(6);
	await page.mouse.move(5, 5);
	await expect(tip).toHaveCount(0);

	// The moments: now pressed at first, then a later one.
	await expect(moments(page).getByRole('button')).toHaveCount(8);
	await expect(moments(page).getByRole('button', { name: 'Maintenant' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const tomorrow = moments(page).getByRole('button', { name: /^Demain 14/ });
	await tomorrow.click();
	await expect(tomorrow).toHaveAttribute('aria-pressed', 'true');
	await expect(paris).toHaveAccessibleName(/^Paris : -?\d+°/);
	await moments(page).getByRole('button', { name: 'Maintenant' }).click();

	// The whole card: the Home Assistant card of the town's cell, then closed.
	await paris.click();
	const card = page.getByTestId('town-card');
	await expect(card).toBeVisible();
	await expect(card).toContainText('Météo · Paris');
	// The recorded point is Open-Meteo's: the Home Assistant card draws its home page with Météo-France's forecast only
	// (`cardDrawsHome`), so the card holds the site's own reading of the place, then the air.
	await expect(card.getByTestId('town-card-own')).toBeVisible({ timeout: 15_000 });
	await expect(card.locator('vigie-card')).toHaveCount(0);
	await expect(card.getByRole('heading', { name: "Qualité de l'air" })).toBeVisible();
	await expect(card.getByRole('link', { name: 'Toute la page du lieu' })).toHaveAttribute(
		'href',
		/^\/near#48\.\d{3},2\.\d{3}$/
	);
	await card.getByRole('button', { name: 'Fermer la météo de la ville' }).click();
	await expect(card).toHaveCount(0);

	// The layer turned off: no pill, no bar; still off on the next visit.
	await openLayers(page, 'Météo');
	await expect(page.getByTestId('towns-toggle')).toBeChecked();
	await page.getByTestId('towns-toggle').uncheck();
	await closeLayers(page);
	await expect(pills(page)).toHaveCount(0);
	await expect(moments(page)).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await page.getByRole('button', { name: 'France', exact: true }).click();
	await page.waitForTimeout(500);
	await expect(pills(page)).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('on a phone, a tap on a pill opens the whole card as a sheet from the bottom', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'mobile', 'the sheet is the phone layout');
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await page.getByRole('button', { name: 'France', exact: true }).click();
	await expect.poll(async () => pills(page).count(), { timeout: 20_000 }).toBeGreaterThan(2);
	await pills(page).first().tap();
	await expect(page.getByTestId('town-tip')).toHaveCount(0);
	const card = page.getByTestId('town-card');
	await expect(card).toBeVisible();
	const box = (await card.boundingBox())!;
	const screen = page.viewportSize()!;
	// A sheet from the bottom of the screen, over the page, the whole width.
	expect(Math.round(box.width)).toBe(screen.width);
	expect(box.y).toBeGreaterThan(100);
	expect(Math.round(box.y + box.height)).toBe(screen.height);
	await card.getByRole('button', { name: 'Fermer la météo de la ville' }).click();
	await expect(card).toHaveCount(0);
});
