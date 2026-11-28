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
	// "Here", the sea, the sky and travel act on the side panel; the others open their layers over the map.
	await expect(rail.getByRole('button')).toHaveText([
		'Ici',
		'Alertes',
		'Météo1(1 couche affichée)',
		'Mer',
		'Ciel',
		'Voyager',
		/^Carte/
	]);
	await expect(rail.getByRole('link')).toHaveCount(0);
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
	// One family at a time; its own button folds it again. The sea takes the side panel, with the tide and the sea page.
	const seaButton = rail.getByRole('button', { name: 'Mer' });
	await seaButton.click();
	await expect(seaButton).toHaveAttribute('aria-pressed', 'true');
	await expect(rail.getByRole('button', { name: /^Météo/ })).toHaveAttribute('aria-expanded', 'false');
	await expect(panel).toHaveCount(0);
	const sea = page.locator('section.sea');
	await expect(sea.getByRole('heading', { level: 2, name: 'Aller à l’eau ?' })).toBeVisible();
	await expect(page.getByTestId('tide-toggle')).toBeVisible();
	await expect(sea.getByRole('link', { name: /page Mer/ })).toHaveAttribute('href', '/sea');
	await seaButton.click();
	await expect(seaButton).toHaveAttribute('aria-pressed', 'false');
	await expect(sea).toHaveCount(0);
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
		'Sky',
		'Travel',
		/^Map/
	]);
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

test('the sea family says where to go in the side panel, pins the spots on the map, and opens the card of a spot over it', async ({
	page
}) => {
	const errors = collectErrors(page);
	const hossegor = 'soorts-hossegor-plage-sud-point-d-or';
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await layerRail(page).getByRole('button', { name: 'Mer' }).click();
	const sea = page.locator('section.sea');
	await expect(sea.locator('.said')).not.toBeEmpty();
	// The activities as chips, the surf first; another is kept for the sea page too.
	const chips = sea.getByRole('group', { name: 'Mon activité' }).getByRole('button');
	await expect(chips).toHaveCount(4);
	await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
	await expect(sea.getByRole('heading', { name: 'Les meilleurs maintenant' })).toBeVisible();
	await expect(sea.locator('.spots li').first()).toBeVisible();

	// A pin opens the card of its spot over the map; Escape closes it.
	await page.evaluate(() =>
		(window as unknown as { vigieMap: { jumpTo(o: object): void } }).vigieMap.jumpTo({
			center: [-1.44, 43.66],
			zoom: 11
		})
	);
	const pin = page.locator(`[data-testid="sea-pin"][data-spot="${hossegor}"]`);
	await expect(pin).toBeVisible();
	await pin.click();
	const card = page.getByTestId('spot-bubble');
	await expect(card).toBeVisible();
	await expect(card.getByRole('tab', { name: 'Surf' })).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Escape');
	await expect(card).toHaveCount(0);

	// Another activity: the chip is pressed, and the sea page reads it next time.
	await chips.nth(1).click();
	await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
	expect(await page.evaluate(() => localStorage.getItem('vigie-sea'))).toContain('kite');
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('the sky family puts the NOAA oval on the map and the aurora tonight of the place of "here" in the side panel', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/#42.306,9.15,50');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	const sky = layerRail(page).getByRole('button', { name: 'Ciel' });
	await sky.click();
	await expect(sky).toHaveAttribute('aria-pressed', 'true');
	await expect(layerRail(page).getByRole('button', { name: 'Ici' })).toHaveAttribute('aria-pressed', 'false');
	const panel = page.locator('section.sky');
	await expect(panel.getByText(/^Ciel · Ce soir d.ici/)).toBeVisible();
	await expect(panel.getByRole('link', { name: /page Ciel/ })).toHaveAttribute('href', '/sky');
	await expect(panel.getByRole('link', { name: 'Éclipses de Soleil' })).toHaveAttribute(
		'href',
		'/sky/eclipses'
	);
	// The oval is drawn: its bands are in the map's source.
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const map = (
					window as unknown as {
						vigieMap: { getSource(id: string): { getData(): Promise<{ features?: unknown[] }> } | undefined };
					}
				).vigieMap;
				return (await map.getSource('aurora')?.getData())?.features?.length ?? 0;
			})
		)
		.toBeGreaterThan(0);
	// The same button leaves the sky; the oval goes with it.
	await sky.click();
	await expect(panel).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('the travel family colours the countries by one ministry, counts them, and a country opens its card over the map', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await layerRail(page).getByRole('button', { name: 'Voyager' }).click();
	const panel = page.locator('section.trips');
	await expect(panel.getByRole('heading', { level: 2, name: 'Partir à l’étranger' })).toBeVisible();
	const ministries = panel.getByRole('radiogroup', { name: 'Carte des avis de :' }).getByRole('radio');
	await expect(ministries.first()).toHaveAttribute('aria-checked', 'true');
	await expect(panel.locator('.counts li').first()).toBeVisible();
	await ministries.nth(1).click();
	await expect(ministries.nth(1)).toHaveAttribute('aria-checked', 'true');
	await expect(panel.getByRole('link', { name: /page Voyager/ })).toHaveAttribute('href', '/travel');

	// A country touched on the map: its card, each ministry side by side, and its page.
	await page.evaluate(() =>
		(window as unknown as { vigieMap: { jumpTo(o: object): void } }).vigieMap.jumpTo({
			center: [-6.5, 31.5],
			zoom: 3.5
		})
	);
	// On a phone the map is under the panel: brought on screen first.
	await page.locator('.mapwrap').scrollIntoViewIfNeeded();
	await page.waitForTimeout(1500);
	const box = (await page.locator('.mapwrap').boundingBox())!;
	const [x, y] = await page.evaluate(() => {
		const p = (
			window as unknown as { vigieMap: { project(at: [number, number]): { x: number; y: number } } }
		).vigieMap.project([-6.5, 31.5]);
		return [p.x, p.y];
	});
	await page.mouse.click(box.x + x, box.y + y);
	const card = page.getByTestId('travel-card');
	await expect(card.getByRole('heading', { name: 'Maroc' })).toBeVisible();
	await expect(card.locator('.marks li')).toHaveCount(await ministries.count());
	await expect(card.getByRole('link', { name: 'Ouvrir la fiche du pays' })).toHaveAttribute(
		'href',
		'/travel/ma'
	);
	await page.keyboard.press('Escape');
	await expect(card).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});
