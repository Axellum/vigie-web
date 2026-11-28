import { expect, test, type Page } from '@playwright/test';
import { closeLayers, layerRail, openLayers } from './layers';

// The home map in the frame of the sea map: the rail of the families of layers beside the map, never over it, and the choices of
// a family in a panel opened from that rail, over the map. Nothing to tick is left in the side panel.

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected when the map moves over it (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const TOGGLES = [
	'fires-toggle',
	'radar-toggle',
	'observed-rain-toggle',
	'rain-field-toggle',
	'flow-toggle',
	'wind-toggle',
	'tide-toggle',
	'relief-toggle',
	'contours-toggle'
];

test('the rail of the home map stands beside it, and each family opens its layers over the map', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	const rail = layerRail(page);
	// The relief is on at first: its family says so.
	await expect(rail.getByRole('button')).toHaveText(['Alertes', 'Pluie', 'Vent', 'Marée', /^Carte/]);
	await expect(rail.getByRole('button', { name: /^Carte/ })).toHaveAccessibleName(
		'Carte (1 couche affichée)'
	);
	// The rail does not cover the map.
	const r = (await rail.boundingBox())!;
	const m = (await page.locator('.mapwrap').boundingBox())!;
	expect(r.x + r.width <= m.x + 1 || r.y + r.height <= m.y + 1).toBe(true);
	// Folded, no box of a layer is on the page.
	for (const id of TOGGLES) await expect(page.getByTestId(id)).toHaveCount(0);

	// The alerts: what the map shows, each kind can be hidden, and the fires seen by satellite.
	const alerts = rail.getByRole('button', { name: /^Alertes/ });
	await openLayers(page, 'Alertes');
	await expect(alerts).toHaveAttribute('aria-expanded', 'true');
	const panel = page.locator('#home-layers');
	await expect(panel.getByRole('heading', { name: 'Alertes' })).toBeVisible();
	const kind = panel.getByRole('group', { name: 'Ce que montre la carte' }).getByRole('button').first();
	await expect(kind).toHaveAttribute('aria-pressed', 'true');
	await kind.click();
	await expect(kind).toHaveAttribute('aria-pressed', 'false');
	await kind.click();
	await expect(kind).toHaveAttribute('aria-pressed', 'true');
	await expect(alerts.locator('.count')).toHaveCount(0);
	await page.getByTestId('fires-toggle').check();
	// The rail says how many layers of the family are shown.
	await expect(alerts.locator('.count')).toHaveText('1');
	await expect(alerts).toHaveAccessibleName('Alertes (1 couche affichée)');
	await page.getByTestId('fires-toggle').uncheck();
	await closeLayers(page);
	await expect(panel).toHaveCount(0);

	// One family at a time; its own button folds it again.
	await openLayers(page, 'Pluie');
	await expect(panel.getByRole('heading', { name: 'Pluie' })).toBeVisible();
	for (const id of ['radar-toggle', 'observed-rain-toggle', 'rain-field-toggle'])
		await expect(page.getByTestId(id)).toBeVisible();
	await openLayers(page, 'Vent');
	await expect(rail.getByRole('button', { name: /^Pluie/ })).toHaveAttribute('aria-expanded', 'false');
	for (const id of ['flow-toggle', 'wind-toggle']) await expect(page.getByTestId(id)).toBeVisible();
	await openLayers(page, 'Marée');
	await expect(page.getByTestId('tide-toggle')).toBeVisible();
	await openLayers(page, 'Carte');
	for (const id of ['relief-toggle', 'contours-toggle']) await expect(page.getByTestId(id)).toBeVisible();
	await rail.getByRole('button', { name: /^Carte/ }).click();
	await expect(panel).toHaveCount(0);

	await page.goto('/?lang=en');
	await expect(layerRail(page).getByRole('button')).toHaveText(['Alerts', 'Rain', 'Wind', 'Tide', /^Map/]);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});
