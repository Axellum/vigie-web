import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The sea pages (`/sea`, `/sea/<activity>`): "should you go?" for every spot, from the API's overview recorded in
// e2e/fixtures/activities-overview.json. The expectations come from that recording, so they hold on any day it was made.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const overview: Json = JSON.parse(
	readFileSync(join(import.meta.dirname, 'fixtures', 'activities-overview.json'), 'utf-8')
);
const RANK: Record<string, number> = { good: 0, possible: 1, poor: 2 };

const verdictsOf = (activity: string): (string | null)[] =>
	overview.spots.map((s: Json) => s.activities.find((a: Json) => a.id === activity)?.verdict ?? null);
const bestOf = (activity: string): string | null =>
	verdictsOf(activity)
		.filter((v): v is string => v != null)
		.sort((a, b) => RANK[a] - RANK[b])[0] ?? null;

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('vigie-sea') ?? 'null'));

test('the sea page answers "should you go?" for an activity, with every spot, the verdict as a word and a sign', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea');
	await expect(page).toHaveTitle(/Mer · Aller à l’eau \?/);
	await expect(page.getByRole('heading', { level: 1, name: 'Aller à l’eau ?' })).toBeVisible();

	// The four activities, the surf by default; the others are links with an address of their own.
	const pills = page.getByRole('navigation', { name: 'Mon activité' });
	await expect(pills.getByRole('link')).toHaveCount(4);
	await expect(pills.getByRole('link', { name: /^Surf/ })).toHaveAttribute('aria-current', 'page');
	await expect(pills.getByRole('link', { name: /^Kite/ })).toHaveAttribute('href', '/sea/kite');
	await expect(pills.getByRole('link', { name: /^Pêche à pied/ })).toHaveAttribute(
		'href',
		'/sea/shore-fishing'
	);

	// One sentence, drawn from the best verdict of the recording.
	const sentence = page.locator('.sentence');
	const best = bestOf('surf');
	await expect(sentence).toHaveText(
		best === 'good' ? /^Bon / : best === 'possible' ? /^Rien de bon, mais possible/ : /^Pas aujourd’hui/
	);

	// Every spot that can be judged, each with a word (never the colour alone), and a link to its page.
	const rows = page.locator('.block > .spots > li');
	await expect(rows).toHaveCount(verdictsOf('surf').length);
	for (const row of await rows.all()) {
		await expect(row.locator('.chip')).toHaveText(/(✓|~|✕|\?) (Bon|Possible|Déconseillé|Pas de verdict)/);
		await expect(row.locator('a')).toHaveAttribute('href', /^\/surf\/[a-z0-9-]+$/);
	}
	await expect(page.getByText('Pas pour la sécurité', { exact: false }).first()).toBeVisible();
	// The two sentences the API gives in English are said in French here, and the English ones are not on the page (a unit test holds the
	// English side to this recording, so a reworded sentence of the API is shown as it comes, not in a French that no longer matches).
	await expect(page.getByText('Les verdicts sont des règles de Vigie', { exact: false })).toBeVisible();
	await expect(page.getByText('Pas pour la sécurité ni pour la navigation', { exact: false })).toBeVisible();
	await expect(page.getByText('The verdicts are rules of Vigie', { exact: false })).toHaveCount(0);
	await expect(page.getByText('Not for safety and not for navigation', { exact: false })).toHaveCount(0);
	// When they were worked out, so a copy kept by the browser is not taken for the current answer.
	await expect(page.getByText(/^Verdicts calculés .+, \d\d:\d\d\.$/)).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		await page.evaluate(() => window.innerWidth)
	);
	expect(errors).toEqual([]);
});

test('the English sea page shows the sentences of the API as they come, and no French one', async ({
	page
}) => {
	await page.goto('/sea?lang=en');
	await expect(page.getByText(overview.limits, { exact: true })).toBeVisible();
	await expect(page.getByText(overview.disclaimer, { exact: true })).toBeVisible();
	await expect(page.getByText('Les verdicts sont des règles', { exact: false })).toHaveCount(0);
});

test('an activity has its own address, is remembered in this browser only, and the kite keeps its range', async ({
	page,
	request
}) => {
	const errors = collectErrors(page);
	expect((await request.get('/sea/diving')).status()).toBe(404);

	await page.goto('/sea/kite');
	await expect(page).toHaveTitle(/Kite, wing, windsurf · Aller à l’eau \?/);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/sea\/kite$/);
	const pills = page.getByRole('navigation', { name: 'Mon activité' });
	await expect(pills.getByRole('link', { name: /^Kite/ })).toHaveAttribute('aria-current', 'page');
	// The default range of the API (12 to 25 knots), said in the default unit, km/h.
	await expect(page.getByText('Plage de vent du kite : 22 à 46 km/h.')).toBeVisible();
	expect(await stored(page)).toBeNull(); // looking is not choosing

	// Choosing the boat: its address, and the choice kept; the bare address then shows it.
	await pills.getByRole('link', { name: /^Bateau/ }).click();
	await expect(page).toHaveURL(/\/sea\/boat$/);
	expect((await stored(page)).activity).toBe('boat');
	await page.goto('/sea');
	await expect(page).toHaveURL(/\/sea\/boat$/);
	await expect(pills.getByRole('link', { name: /^Bateau/ })).toHaveAttribute('aria-current', 'page');

	// The settings: the unit, then a wind range typed in it, which the kite page takes in whole knots.
	await page.getByText('Réglages', { exact: true }).click();
	await page.getByRole('radio', { name: 'nœuds' }).check();
	expect((await stored(page)).unit).toBe('kn');
	await page.getByLabel('de', { exact: true }).fill('30');
	await page.getByLabel('à', { exact: true }).fill('20');
	await page.getByRole('button', { name: 'Appliquer' }).click();
	await expect(page.getByRole('alert')).toContainText('Une plage commence au-dessus de 0');
	await page.getByLabel('de', { exact: true }).fill('15');
	await page.getByLabel('à', { exact: true }).fill('30');
	await page.getByRole('button', { name: 'Appliquer' }).click();
	await expect(page).toHaveURL(/\/sea\/kite\?min=15&max=30$/);
	expect(await stored(page)).toEqual({ activity: 'kite', unit: 'kn', wind: { min: 15, max: 30 } });

	// The kite page, opened without the range, takes the one chosen last.
	await page.goto('/sea/kite');
	await expect(page).toHaveURL(/\/sea\/kite\?min=15&max=30$/);
	expect(errors).toEqual([]);
});

test('around a followed place the nearest spots come first, and the others are folded', async ({ page }) => {
	await page.addInitScript(() =>
		localStorage.setItem(
			'vigie-places',
			JSON.stringify([{ lat: 43.483, lon: -1.559, radiusKm: 25, name: 'Biarritz', profile: 'surf' }])
		)
	);
	await page.goto('/sea/kite');
	await expect(page.getByText('Autour de Biarritz')).toBeVisible();
	const near = page.locator('.block > .spots > li');
	await expect(near.first()).toContainText(/à \d/);
	const folded = page.locator('details.far summary');
	await expect(folded).toHaveText(/Plus loin \(\d+ spots\)/);
	await page.getByRole('button', { name: 'Tous les spots' }).click();
	await expect(page.getByText('Pas de lieu choisi')).toBeVisible();
	await expect(page.locator('.block > .spots > li')).toHaveCount(verdictsOf('kite').length);
});

test('the page works when the browser refuses its storage', async ({ page }) => {
	const errors = collectErrors(page);
	await page.addInitScript(() =>
		Object.defineProperty(window, 'localStorage', {
			get() {
				throw new DOMException('blocked', 'SecurityError');
			}
		})
	);
	await page.goto('/sea');
	await expect(page.locator('.block > .spots > li').first()).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Mon activité' })
		.getByRole('link', { name: /^Bateau/ })
		.click();
	await expect(page).toHaveURL(/\/sea\/boat$/);
	expect(errors).toEqual([]);
});

test('the sea pages are in the sitemap and the navigation says Mer on the surf pages too', async ({
	page,
	request
}) => {
	const xml = await (await request.get('/sitemap.xml')).text();
	for (const path of ['/sea', '/sea/surf', '/sea/kite', '/sea/boat', '/sea/shore-fishing']) {
		expect(xml).toContain(`https://vigie.auxfilsdesidees.fr${path}</loc>`);
	}
	await page.goto('/surf');
	await expect(
		page.getByRole('navigation', { name: 'Vigie' }).getByRole('link', { name: 'Mer' })
	).toHaveAttribute('aria-current', 'page');
});

test('a spot page answers first for the activity chosen, switches with one tap, and says the wind in the unit chosen', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/surf/soorts-hossegor-plage-sud-point-d-or');
	const top = page.locator('section.top');
	await expect(top.getByRole('heading', { level: 2, name: 'Aller à l’eau ici ?' })).toBeVisible();
	// On top of the page, before the surf card and the four verdicts.
	expect(
		await page.evaluate(() => {
			const sections = [...document.querySelectorAll('.page > section')];
			return sections.findIndex((s) => s.classList.contains('top'));
		})
	).toBe(0);

	// Nothing chosen: the surf, with the verdict of the API, its slot and the one reason that holds it back.
	await expect(top.getByRole('button', { name: /^Surf/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(top.locator('.chip')).toContainText('Possible');
	await expect(top.getByText('Meilleur créneau')).toBeVisible();
	await expect(top.getByText('Hauteur de la houle : trop petite')).toBeVisible();

	// One tap on another activity: its verdict, kept in this browser, taken again after a reload.
	await top.getByRole('button', { name: /^Bateau/ }).click();
	await expect(top.getByRole('button', { name: /^Bateau/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(top.locator('.chip')).toContainText('Bon');
	expect((await stored(page)).activity).toBe('boat');
	await page.reload();
	await expect(top.getByRole('button', { name: /^Bateau/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(top.getByRole('link', { name: 'Les autres spots pour cette activité' })).toHaveAttribute(
		'href',
		'/sea/boat'
	);

	// The wind of the criteria in the unit chosen: km/h until the visitor says knots.
	const kite = page.locator('section.verdicts article.act', {
		has: page.getByRole('heading', { level: 3, name: 'Kite, wing, windsurf', exact: true })
	});
	await kite.locator('details.crit summary').click();
	await expect(kite.locator('.criteria .data').filter({ hasText: '17 km/h' })).toBeVisible();
	await page.evaluate(() =>
		localStorage.setItem('vigie-sea', JSON.stringify({ activity: 'kite', unit: 'kn', wind: null }))
	);
	await page.reload();
	await kite.locator('details.crit summary').click();
	await expect(kite.locator('.criteria .data').filter({ hasText: '9 nœuds' })).toBeVisible();
	await expect(top.getByRole('button', { name: /^Kite/ })).toHaveAttribute('aria-pressed', 'true');
	expect(errors).toEqual([]);
});
