import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'));
const hazards = fixture('hazards');
const fr = fixture('warnings-FR');

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
