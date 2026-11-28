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
	'towns-toggle',
	'radar-toggle',
	'observed-rain-toggle',
	'rain-field-toggle',
	'flow-toggle',
	'wind-toggle',
	'tide-toggle',
	'relief-toggle',
	'contours-toggle',
	'photo-toggle',
	'details-toggle'
];

test('the rail of the home map stands beside it, and each family opens its layers over the map', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	const rail = layerRail(page);
	// The weather of the towns, the relief and the details of the IGN are on at first: their families say so.
	// "Here" acts on the side panel; the sky and travel are still pages of their own, linked from the rail.
	await expect(rail.getByRole('button')).toHaveText([
		'Ici',
		'Alertes',
		'Météo1(1 couche affichée)',
		'Mer',
		/^Carte/
	]);
	await expect(rail.getByRole('link')).toHaveText(['Ciel', 'Voyager']);
	await expect(rail.getByRole('link', { name: 'Ciel' })).toHaveAttribute('href', '/sky');
	await expect(rail.getByRole('link', { name: 'Voyager' })).toHaveAttribute('href', '/travel');
	await expect(rail.getByRole('button', { name: /^Carte/ })).toHaveAccessibleName(
		'Carte (2 couches affichées)'
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

	await openLayers(page, 'Météo');
	await expect(panel.getByRole('heading', { name: 'Météo' })).toBeVisible();
	await expect(page.getByTestId('towns-toggle')).toBeChecked();

	// The rain and the wind are in the weather family, under their own headings.
	await expect(panel.getByRole('heading', { name: 'Pluie' })).toBeVisible();
	await expect(panel.getByRole('heading', { name: 'Vent' })).toBeVisible();
	for (const id of [
		'radar-toggle',
		'observed-rain-toggle',
		'rain-field-toggle',
		'flow-toggle',
		'wind-toggle'
	])
		await expect(page.getByTestId(id)).toBeAttached();
	// One family at a time; its own button folds it again. The sea holds the tide, and leads to the sea page.
	await openLayers(page, 'Mer');
	await expect(rail.getByRole('button', { name: /^Météo/ })).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByTestId('tide-toggle')).toBeVisible();
	await expect(panel.getByRole('link', { name: /page Mer/ })).toHaveAttribute('href', '/sea');
	await openLayers(page, 'Carte');
	for (const id of ['relief-toggle', 'contours-toggle', 'photo-toggle', 'details-toggle'])
		await expect(page.getByTestId(id)).toBeVisible();
	await rail.getByRole('button', { name: /^Carte/ }).click();
	await expect(panel).toHaveCount(0);

	await page.goto('/?lang=en');
	await expect(layerRail(page).getByRole('button')).toHaveText([
		'Here',
		'Alerts',
		/^Weather1/,
		'Sea',
		/^Map/
	]);
	await expect(layerRail(page).getByRole('link')).toHaveText(['Sky', 'Travel']);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('"here" puts the map on a place of the address, its cards in short beside it, and goes back to the world', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/#42.306,9.15,50');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	const here = layerRail(page).getByRole('button', { name: 'Ici' });
	await expect(here).toHaveAttribute('aria-pressed', 'true');
	// The side panel holds the place: what counts there, the cards of "near me" in short, and the way to all of them.
	const panel = page.locator('section.here');
	await expect(panel.getByText('Autour de moi')).toBeVisible();
	await expect(panel.locator('.said')).not.toBeEmpty();
	await expect(panel.locator('.near-card').first()).toBeVisible();
	await expect(panel.getByRole('heading', { name: 'Vigilances officielles' })).toBeVisible();
	await expect(panel.getByRole('link', { name: 'Tout voir pour ce lieu' })).toHaveAttribute(
		'href',
		'/near#42.306,9.15,50'
	);
	// The list of the world is not there while the place is.
	await expect(page.getByRole('heading', { level: 2, name: 'Le point' })).toHaveCount(0);
	// The map went to the place.
	await expect.poll(async () => page.evaluate(() => location.hash)).toBe('#42.306,9.15,50');

	// The same button goes back to the world, and the address forgets the place.
	await here.click();
	await expect(here).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('heading', { level: 2, name: 'Le point' })).toBeVisible();
	await expect.poll(async () => page.evaluate(() => location.hash)).toBe('');
	// And comes back to the place, kept in the page.
	await here.click();
	await expect(panel.getByRole('heading', { name: 'Vigilances officielles' })).toBeVisible();
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});
