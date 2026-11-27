import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The sea map (`/sea`, `/sea/<activity>`): a pin per spot with the figures of the hour for the activity and the way the tide goes,
// a card per spot with five tabs, and the families of layers in the frame of the map. The figures come from the recordings of
// e2e/fixtures (activities-overview.json, surf-overview.json, surf-hossegor.json, tv-point-hossegor.json,
// sea-places-near-bathing.json), so the expectations hold on any day.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf-8'));
const surf = fixture('surf-overview.json');
const HOSSEGOR = 'soorts-hossegor-plage-sud-point-d-or';
const hossegor = surf.spots.find((s: Json) => s.id === HOSSEGOR);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

/** The map centred on Hossegor, close enough for its label to be drawn, then its pin. */
async function hossegorPin(page: Page) {
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 20_000 });
	await page.evaluate(
		([lon, lat]) =>
			(window as unknown as { vigieMap: { jumpTo(o: object): void } }).vigieMap.jumpTo({
				center: [lon, lat],
				zoom: 11
			}),
		[hossegor.lon, hossegor.lat]
	);
	const pin = page.locator(`[data-testid="sea-pin"][data-spot="${HOSSEGOR}"]`);
	await expect(pin).toBeVisible();
	return pin;
}

test('every pin says its spot, its verdict and the figures of the hour, and the tide on the spots the model reaches', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 20_000 });
	const pins = page.locator('[data-testid="sea-pin"]');
	await expect(pins.first()).toBeVisible();
	// Where labels would touch, some give way: never more pins than spots, and never none.
	const count = await pins.count();
	expect(count).toBeGreaterThan(3);
	expect(count).toBeLessThanOrEqual(surf.spots.length);
	for (const pin of (await pins.all()).slice(0, 5)) {
		const id = await pin.getAttribute('data-spot');
		const spot = surf.spots.find((s: Json) => s.id === id);
		// The surf pins: the swell of the recording, then the way the tide goes, in words for a screen reader.
		await expect(pin).toHaveAttribute('aria-label', new RegExp(`^${spot.name.replace(/[()]/g, '\\$&')} : `));
		await expect(pin).toContainText(
			`${spot.now.swell.height_m.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`
		);
		await expect(pin).toHaveAttribute(
			'aria-label',
			spot.now.tide.trend === 'rising' ? /marée montante$/ : /marée descendante$/
		);
	}
	// The kite: the wind instead, in km/h until the visitor chooses knots, with its direction.
	await page.getByRole('navigation', { name: 'Mon activité' }).getByRole('link', { name: /^Kite/ }).click();
	await expect(page).toHaveURL(/\/sea\/kite$/);
	await expect(pins.first()).toContainText(/\d+ km\/h/);
	await expect(pins.first().locator('svg.wd')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('a pin opens the card of its spot, with the same figures, five tabs and the warning; Escape closes it', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	const pin = await hossegorPin(page);
	const said = (await pin.textContent())!.trim();
	await pin.click();

	const card = page.getByTestId('spot-bubble');
	await expect(card.getByRole('heading', { level: 2, name: hossegor.name })).toBeVisible();
	await expect(pin).toHaveAttribute('aria-pressed', 'true');
	// The surf opens on its tab: where the beach faces and where the swell and the wind come from, and the hour of the pin.
	await expect(card.getByRole('tab', { name: 'Surf' })).toHaveAttribute('aria-selected', 'true');
	await expect(
		card.getByRole('img', { name: /^Plage tournée vers ONO ; houle de .+ ; vent de .+$/ })
	).toBeVisible();
	await expect(card.locator('dd').first()).toContainText(said);
	await expect(card.getByText('Pas pour la sécurité ni pour la navigation', { exact: false })).toBeVisible();

	// The four verdicts of the spot, then the tide and the weather, each asked when its tab is opened.
	await card.getByRole('tab', { name: 'Activités' }).click();
	await expect(card.getByRole('heading', { name: 'Aller à l’eau ici ?' })).toBeVisible();
	await card.getByRole('tab', { name: 'Marée' }).click();
	await expect(card.getByRole('heading', { level: 3, name: 'Marée' })).toBeVisible();
	await card.getByRole('tab', { name: 'Météo' }).click();
	await expect(card.getByText('Maintenant', { exact: true }).first()).toBeVisible();
	// The keyboard goes from tab to tab with the arrows.
	await card.getByRole('tab', { name: 'Météo' }).press('ArrowLeft');
	await expect(card.getByRole('tab', { name: 'Marée' })).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('Escape');
	await expect(card).toHaveCount(0);
	await expect(pin).toBeFocused();
	expect(errors).toEqual([]);
});

test('the swimming tab says the water, the swell, the wind and the class of the water of the bathing site of the spot', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	const pin = await hossegorPin(page);
	await pin.click();
	const card = page.getByTestId('spot-bubble');
	await card.getByRole('tab', { name: 'Baignade' }).click();
	await expect(card.getByRole('tab', { name: 'Baignade' })).toHaveAttribute('aria-selected', 'true');
	// The water of the grid point (recorded with the sea: tv-point-hossegor.json), then the swell of the pin.
	const sea = fixture('tv-point-hossegor.json').marine.sea_surface_temperature_c as number;
	const swell = hossegor.now.swell.height_m.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
	await expect(card.locator('p.lead')).toHaveText(
		new RegExp(`^Eau à ${sea.toLocaleString('fr-FR')} °C, houle de ${swell} m, vent .+\\.$`)
	);
	// The nearest monitored bathing site on the shore (Notre Dame, Capbreton, 0.4 km south), not the lake behind the beach.
	const quality = card.getByTestId('bathing-quality');
	await expect(quality).toHaveText(/^Excellente · Notre Dame, Capbreton, à 0,4 km$/);
	await expect(quality.getByRole('link')).toHaveAttribute('href', /^\/sea\/places\/bathing-/);
	await expect(card.getByText('pas l’eau d’aujourd’hui', { exact: false })).toBeVisible();
	await expect(card.getByText('Pas pour la sécurité ni pour la navigation', { exact: false })).toBeVisible();
	expect(errors).toEqual([]);
});

test('the families of layers sit in the frame, off the map, and open their choices', async ({ page }) => {
	await page.goto('/sea/surf');
	const rail = page.getByRole('group', { name: 'Couches de la carte' });
	await expect(rail.getByRole('button')).toHaveText(['Spots', 'Vent', 'Pluie']);
	// The rail does not cover the map: the coast and its pins stay free.
	const r = (await rail.boundingBox())!;
	const m = (await page.locator('.mapzone').boundingBox())!;
	expect(r.x + r.width <= m.x + 1 || r.y + r.height <= m.y + 1).toBe(true);

	await rail.getByRole('button', { name: 'Vent' }).click();
	await expect(rail.getByRole('button', { name: 'Vent' })).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByTestId('wind-toggle')).toBeVisible();
	await expect(page.getByTestId('flow-toggle')).toBeVisible();
	await rail.getByRole('button', { name: 'Pluie' }).click();
	await expect(page.getByTestId('radar-toggle')).not.toBeChecked();
	await expect(page.getByTestId('rain-field-toggle')).toBeVisible();
	await page.getByRole('button', { name: 'Fermer les couches' }).click();
	await expect(page.getByTestId('radar-toggle')).toHaveCount(0);
});

test('on a phone the card is a sheet at the bottom, and the spot stays in sight above it', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'mobile', 'the sheet is the phone layout');
	await page.goto('/sea/surf');
	const pin = await hossegorPin(page);
	await pin.click();
	const card = page.getByTestId('spot-bubble');
	await expect(card).toBeVisible();
	const viewport = page.viewportSize()!;
	const sheet = (await card.boundingBox())!;
	expect(Math.abs(sheet.y + sheet.height - viewport.height)).toBeLessThanOrEqual(2);
	expect(sheet.width).toBeGreaterThanOrEqual(viewport.width - 1);
	// The map moved so that the pin is above the sheet.
	await expect.poll(async () => (await pin.boundingBox())!.y + 13).toBeLessThan(sheet.y);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
});

test('the card of a spot is read through the site, the same for everybody, and 404 for a spot the API does not know', async ({
	request
}) => {
	const known = await request.get(`/data/spot/${HOSSEGOR}.json`);
	expect(known.status()).toBe(200);
	expect(known.headers()['cache-control']).toContain('public');
	const body = await known.json();
	expect(body.forecast.spot.id).toBe(HOSSEGOR);
	expect(body.verdicts.activities.map((a: Json) => a.id).sort()).toEqual([
		'boat',
		'kite',
		'shore_fishing',
		'surf'
	]);
	expect((await request.get('/data/spot/no-such-spot.json')).status()).toBe(404);
	expect((await request.get('/data/spot/BAD_ID.json')).status()).toBe(404);
});
