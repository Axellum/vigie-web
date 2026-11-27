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

test('the wind on the beaches puts the wind of the hour on the labels of the surf, is kept, and is always there on the kite', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	const pin = await hossegorPin(page);
	await expect(pin.locator('.wn')).toHaveCount(0);
	const rail = page.getByRole('group', { name: 'Couches de la carte' });
	const windButton = rail.getByRole('button', { name: /^Vent/ });
	await expect(windButton.locator('.count')).toHaveCount(0);
	await windButton.click();
	await expect(page.getByText('Le vent sur les plages, celui que prévoit Météo-France')).toBeVisible();
	const beach = page.getByTestId('beach-wind-toggle');
	await expect(beach).not.toBeChecked();
	await beach.check();
	// The swell stays first; the recorded wind follows (10.5 km/h), with the arrow of where it comes from.
	const kmh = `${Math.round(hossegor.now.wind.speed_kmh)} km/h`;
	await expect(pin.locator('.wn')).toHaveText(kmh);
	await expect(pin.locator('svg.wd')).toHaveCount(1);
	await expect(pin).toHaveAttribute('aria-label', new RegExp(`, ${kmh}, vent de `));
	// The rail says how many layers of the wind are shown.
	await expect(windButton.locator('.count')).toHaveText('1');
	await expect(windButton).toHaveAccessibleName('Vent (1 couche affichée)');
	// Kept in this browser.
	await page.reload();
	await expect((await hossegorPin(page)).locator('.wn')).toHaveText(kmh);
	// On the kite the figure is the wind already: the box stays ticked and greyed, and the wind is not said twice.
	await page.goto('/sea/kite');
	const kitePin = await hossegorPin(page);
	await rail.getByRole('button', { name: /^Vent/ }).click();
	await expect(page.getByTestId('beach-wind-toggle')).toBeChecked();
	await expect(page.getByTestId('beach-wind-toggle')).toBeDisabled();
	await expect(kitePin).toContainText(kmh);
	await expect(kitePin.locator('.wn')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('the rain family says where the radar is, and the forecast rain with its lead times, its scale and its badge', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	await hossegorPin(page);
	const rail = page.getByRole('group', { name: 'Couches de la carte' });
	const rainButton = rail.getByRole('button', { name: /^Pluie/ });
	await rainButton.click();
	await expect(page.getByText('La pluie qui tombe, celle de l’heure qui vient')).toBeVisible();
	await page.getByTestId('radar-toggle').check();
	await expect(page.getByTestId('radar-coverage')).toContainText('France');
	await page.getByTestId('rain-field-toggle').check();
	await expect(page.getByTestId('rain-field-leads')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByTestId('rain-field-scale')).toContainText('mm/h');
	await page.getByTestId('rain-field-leads').getByRole('button', { name: '+6 h' }).click();
	await expect(page.getByTestId('rain-field-legend')).toContainText('+6 h');
	await expect(rainButton.locator('.count')).toHaveText('2');
	// Folded, the layers leave a badge on the map: a forecast, not a radar. Its source joins the credits.
	await expect(page.getByTestId('rain-field-badge')).toHaveCount(0);
	await page.getByRole('button', { name: 'Fermer les couches' }).click();
	await expect(page.getByTestId('rain-field-badge')).toContainText('Prévision, pas un radar.');
	await expect(page.locator('details.credits')).toContainText('Licence Ouverte 2.0');
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
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

test('the name of a town opens its card: its weather, five days, the nearest spots, and a spot from there', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/surf');
	await hossegorPin(page);
	// The names of the towns are the base map's: those drawn on the map, found where they are, then clicked there (a pin can lie
	// over a name: the next one is tried).
	const towns = async () =>
		page.evaluate(() => {
			type Feature = { properties: Record<string, string>; geometry: { coordinates: [number, number] } };
			const map = (
				window as unknown as {
					vigieMap: {
						getStyle(): { layers: { id: string; type: string; 'source-layer'?: string }[] };
						getCanvas(): HTMLCanvasElement;
						queryRenderedFeatures(o: object): Feature[];
						project(c: [number, number]): { x: number; y: number };
					};
				}
			).vigieMap;
			const layers = map
				.getStyle()
				.layers.filter((l) => l.type === 'symbol' && l['source-layer'] === 'place')
				.map((l) => l.id);
			const box = map.getCanvas().getBoundingClientRect();
			return map
				.queryRenderedFeatures({ layers })
				.filter((f) => ['city', 'town', 'village'].includes(f.properties.class))
				.map((f) => {
					const p = map.project(f.geometry.coordinates);
					const name = f.properties['name:fr'] || f.properties['name:latin'] || f.properties.name;
					return { name, x: box.left + p.x, y: box.top + p.y };
				})
				.filter(
					(t) => t.x > box.left + 40 && t.x < box.right - 80 && t.y > box.top + 40 && t.y < box.bottom - 40
				);
		});
	await expect.poll(async () => (await towns()).length, { timeout: 15_000 }).toBeGreaterThan(0);
	const card = page.getByTestId('town-bubble');
	let opened = '';
	for (const town of (await towns()).slice(0, 6)) {
		await page.mouse.click(town.x, town.y);
		if (await card.isVisible({ timeout: 1_000 }).catch(() => false)) {
			opened = town.name;
			break;
		}
		await page.keyboard.press('Escape');
	}
	expect(opened).not.toBe('');
	await expect(card.getByRole('heading', { level: 2 })).toHaveText(opened);
	await expect(card).toContainText('Ville');
	// The weather of the recording, five days in the strip, and the way to the page of the place.
	await expect(card.locator('.days li')).toHaveCount(5);
	await expect(card.getByTestId('town-more')).toHaveAttribute(
		'href',
		/^\/near#-?\d+(\.\d+)?,-?\d+(\.\d+)?,300$/
	);
	// The spots nearest to it, at most four, each with its verdict; the first one opens its own card in the place of the town's.
	const spots = card.getByTestId('town-spots').getByRole('button');
	await expect(spots.first()).toBeVisible();
	expect(await spots.count()).toBeLessThanOrEqual(4);
	await expect(spots.first().locator('.chip')).toBeVisible();
	// The recordings hold the forecast of Hossegor only: its spot when the town is near it, else the first one, whose card then
	// finds no forecast (a 404 in the console, and only that).
	const hossegorRow = spots.filter({ hasText: hossegor.name });
	const known = (await hossegorRow.count()) > 0;
	const target = known ? hossegorRow.first() : spots.first();
	const name = await target.locator('strong').innerText();
	await target.click();
	await expect(page.getByTestId('spot-bubble').getByRole('heading', { level: 2 })).toHaveText(name);
	await expect(card).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('spot-bubble')).toHaveCount(0);
	expect(known ? errors : errors.filter((e) => !e.includes('status of 404'))).toEqual([]);
});
