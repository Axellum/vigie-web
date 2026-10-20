import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'));
const hazards = fixture('hazards');
const fr = fixture('warnings-FR');
const point = fixture('point');

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

test('the world map lists the recorded hazards', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 2, name: /Alertes/ })).toBeVisible();
	// The strongest hazard of the recording is in the list.
	const red = hazards.features.find((f: Json) => f.properties.severity === 'RED') ?? hazards.features[0];
	await page.getByLabel('Seulement ce que montre la carte').uncheck();
	await expect(page.getByText(red.properties.title, { exact: true }).first()).toBeVisible();
	// Every hazard of the recording is in the list once the "in view" filter is off.
	await expect(page.locator('.rail .list > .row')).toHaveCount(hazards.features.length);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('a hazard opens in the side panel, then on its own page', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Seulement ce que montre la carte').uncheck();
	const first = hazards.features[0];
	await page.locator('.rail .list > .row').filter({ hasText: first.properties.title }).first().click();
	await expect(page.getByRole('heading', { level: 2, name: first.properties.title })).toBeVisible();
	await page.getByRole('link', { name: 'Ouvrir la fiche' }).click();
	await expect(page).toHaveURL(
		new RegExp(`/alert/${encodeURIComponent(first.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
	);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.properties.title);
});

test('the country page counts the warnings by level', async ({ page }) => {
	await page.goto('/country/fr');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('France');
	for (const [level, label] of [
		['RED', 'Rouge'],
		['ORANGE', 'Orange'],
		['YELLOW', 'Jaune']
	]) {
		const expected = fr.features.filter((f: Json) => f.properties.level === level).length;
		await expect(page.locator('.summary .count').filter({ hasText: label }).locator('.n')).toHaveText(
			String(expected)
		);
	}
});

test('a warning page shows the official text unchanged', async ({ page }) => {
	const withText = fr.features.find((f: Json) => f.properties.texts?.[0]?.description);
	test.skip(!withText, 'the recording has no French warning with a text');
	await page.goto('/country/fr');
	const href = await page
		.locator(`a[href^="/warning/fr/${encodeURIComponent(withText.properties.identifier)}"]`)
		.first()
		.getAttribute('href');
	await page.goto(href!);
	const text =
		withText.properties.texts.find((t: Json) => t.language.startsWith('fr')) ?? withText.properties.texts[0];
	await expect(page.locator('.official p').first()).toHaveText(text.description);
	await expect(page.getByText(/dérivés par Vigie/)).toBeVisible();
});

test('the site speaks English on demand', async ({ page }) => {
	await page.goto('/?lang=en');
	await expect(page.getByRole('link', { name: 'World map' })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	// The choice is kept in a cookie for the next pages.
	await page.goto('/sources');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sources and credits');
});

test('the sources page lists the providers of the API', async ({ page }) => {
	const providers = fixture('providers') as unknown as Json[];
	await page.goto('/sources');
	for (const p of providers.slice(0, 3)) await expect(page.getByText(p.name, { exact: true })).toBeVisible();
});

test('a country with no source, an unknown alert and a down source', async ({ page, request }) => {
	expect((await request.get('/country/jp')).status()).toBe(404);
	expect((await request.get('/alert/does-not-exist')).status()).toBe(404);
	// Spain was not recorded: the mock answers 503, like a source that is down.
	expect((await request.get('/data/warnings/ES.json')).status()).toBe(200);
	expect((await request.get('/data/warnings/PT.json')).status()).toBe(502);
	await page.goto('/country/pt');
	await expect(page.getByText(/ne répond pas pour le moment/)).toBeVisible();
});

test('data answers are cacheable and pages carry the security headers', async ({ request }) => {
	const data = await request.get('/data/warnings/FR.json');
	expect(data.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await data.json();
	expect(body.warnings.length).toBe(fr.features.length);
	expect(Object.keys(body.shapes).length).toBeGreaterThan(0);
	const page = await request.get('/');
	const headers = page.headers();
	expect(headers['content-security-policy']).toContain("default-src 'self'");
	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('the Europe shortcut shows the official warnings of the countries in view', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'one viewport is enough for the map');
	const red = fr.features.find((f: Json) => f.properties.level === 'RED' && f.properties.texts?.length);
	test.skip(!red, 'the recording has no red French warning with a text');
	await page.goto('/');
	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	await page.getByRole('button', { name: 'Europe' }).click();
	const headline = (
		red.properties.texts.find((t: Json) => t.language.startsWith('fr')) ?? red.properties.texts[0]
	).headline;
	await expect(page.locator('.rail .list > .row').filter({ hasText: headline }).first()).toBeVisible({
		timeout: 15_000
	});
	// Countries that were not recorded answer 503: the list says so instead of showing nothing.
	await expect(page.getByText(/Vigilances indisponibles pour le moment/)).toBeVisible();
});

test('near me shows the warnings and the weather of a place given in the address', async ({ page }) => {
	const errors = collectErrors(page);
	const red = fr.features.find(
		(f: Json) =>
			f.properties.level === 'RED' &&
			f.properties.area?.description === 'Haute-Corse' &&
			f.properties.texts?.length
	);
	test.skip(!red, 'the recording has no red warning with a text in Haute-Corse');
	const headline = (
		red.properties.texts.find((t: Json) => t.language.startsWith('fr')) ?? red.properties.texts[0]
	).headline;
	// Corte, in Haute-Corse.
	await page.goto('/near#42.306,9.15,300');
	await expect(page.getByRole('heading', { level: 1, name: 'Autour de moi' })).toBeVisible();
	await expect(page.getByText(headline).first()).toBeVisible({ timeout: 15_000 });
	// The weather is the recorded answer, with its credit; the temperature in French notation.
	const temp = `${String(point.current.temp_c).replace('.', ',')} °C`;
	await expect(page.getByText(temp, { exact: true }).first()).toBeVisible();
	await expect(page.getByText('Weather data by Open-Meteo.com (https://open-meteo.com/)')).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('near me says when no source of official warnings covers the place', async ({ page }) => {
	// Mexico City.
	await page.goto('/near#19.43,-99.13,300');
	await expect(page.getByText(/Aucune source de vigilances officielles/)).toBeVisible({ timeout: 15_000 });
});

test('the weather answer checks its position and is cacheable', async ({ request }) => {
	expect((await request.get('/data/point.json')).status()).toBe(400);
	expect((await request.get('/data/point.json?lat=95&lon=0')).status()).toBe(400);
	const answer = await request.get('/data/point.json?lat=42.3&lon=9.15');
	expect(answer.status()).toBe(200);
	expect(answer.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await answer.json();
	expect(body.current.tempC).toBe(point.current.temp_c);
	expect(body.daily.length).toBe(point.daily.length);
});

test('a place found by name is chosen, with its warnings', async ({ page, request }) => {
	expect((await request.get('/data/places.json?q=a')).status()).toBe(400);
	const answer = await (await request.get('/data/places.json?q=Corte')).json();
	expect(answer.places[0]).toMatchObject({ name: 'Corte', cc: 'FR' });
	expect(answer.attribution).toContain('GeoNames');

	await page.goto('/near');
	await page.getByLabel('Chercher un lieu').fill('Corte');
	await page
		.getByRole('button', { name: /^Corte/ })
		.first()
		.click();
	await expect(page).toHaveURL(/#42\.3\d*,9\.1\d*,300$/);
	await expect(page.getByText(/Lieu choisi : Corte, Corsica, France/)).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: 'Vigilances officielles à cet endroit' })
	).toBeVisible();
});
