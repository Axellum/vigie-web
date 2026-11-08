import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The places of the coast (`/sea/places`, `/sea/places/<id>`): a catalogue, not a forecast. The answers are the API's, recorded in
// e2e/fixtures/sea-place*.json; the mock gives the places around Saint-Malo as the neighbours of every place, so a page may list a
// neighbour that is not near it (it is the recording, not the page).
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'));
const count = fixture('sea-places-count');
const dive = fixture('sea-places-dive');
const malo = fixture('sea-places-malo');

const PORT = '/sea/places/port-port-de-saint-malo-f697';
const BATHING = '/sea/places/bathing-bon-secours-4142';
const SLIPWAY = '/sea/places/slipway-saint-malo-eb59';
const DIVE = '/sea/places/dive-pytheas-ffa1';

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const french = (n: number) => n.toLocaleString('fr-FR');

test('the catalogue says what it is before anything else, and counts each kind without listing four thousand places', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/places');
	await expect(page).toHaveTitle(/Lieux du littoral/);
	await expect(page.getByRole('heading', { level: 1, name: 'Les lieux du littoral' })).toBeVisible();
	await expect(page.getByText('Un catalogue, pas une prévision', { exact: false }).first()).toBeVisible();
	// The English sentence of the API (its caveats) is not shown on the French page: the page says it in French.
	await expect(page.getByText('not a forecast', { exact: false })).toHaveCount(0);

	// One chip per kind, each with its count from the API; "All" holds the total.
	const kinds = page.getByRole('navigation', { name: 'Genre de lieu' });
	await expect(kinds.getByRole('link')).toHaveCount(6);
	await expect(kinds.getByRole('link', { name: /^Tous/ })).toHaveAttribute('aria-current', 'true');
	for (const [type, label] of [
		['port', 'Ports'],
		['slipway', 'Cales'],
		['anchorage', 'Mouillages'],
		['dive', 'Plongée'],
		['bathing', 'Baignade']
	] as const) {
		const chip = kinds.getByRole('link', { name: new RegExp(`^${label}`) });
		await expect(chip).toHaveAttribute('href', `/sea/places?type=${type}`);
		await expect(chip).toContainText(french(count.by_type[type]));
	}
	await expect(kinds.getByRole('link', { name: /^Tous/ })).toContainText(french(count.count));

	// No list without a kind or words, but the way in: a search, a position, and a sentence that says how many there are.
	await expect(page.locator('ul.places')).toHaveCount(0);
	await expect(page.getByText(`le catalogue compte ${french(count.count)} lieux`)).toBeVisible();
	await expect(page.getByLabel('Un nom ou une commune')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Autour de ma position' })).toBeVisible();
	await expect(page.locator('a[href="/sea"]').first()).toBeVisible();
	// The credits the sources ask for are in the page, folded.
	await page.getByText('Sources de cette page').click();
	await expect(page.getByText('© OpenStreetMap contributors', { exact: false })).toBeVisible();
	expect(await fits(page)).toBe(true);
	expect(errors).toEqual([]);
});

test('a kind lists its places, each with a link to its own page; a search finds places without accents or capitals', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto('/sea/places');
	await page
		.getByRole('navigation', { name: 'Genre de lieu' })
		.getByRole('link', { name: /^Plongée/ })
		.click();
	await expect(page).toHaveURL(/\/sea\/places\?type=dive$/);
	await expect(page.getByRole('heading', { level: 2, name: 'Plongée' })).toBeVisible();
	await expect(page.getByText(`${dive.count} lieux`, { exact: true })).toBeVisible();
	const rows = page.locator('ul.places > li a');
	await expect(rows).toHaveCount(dive.places.length);
	for (const place of dive.places)
		await expect(page.locator(`a[href="/sea/places/${place.id}"]`)).toContainText(place.name);
	// The counts of the other kinds are not shown once one is chosen (the API counts the places that match).
	await expect(
		page.getByRole('navigation', { name: 'Genre de lieu' }).getByRole('link', { name: /^Ports/ })
	).not.toContainText(/\d/);

	// A search: the kind is kept, the words are asked as typed.
	await page.getByLabel('Un nom ou une commune').fill('PYTHÉAS');
	await page.getByRole('button', { name: 'Chercher' }).click();
	await expect(page).toHaveURL(/\/sea\/places\?type=dive&q=PYTH/);
	// Recorded answers only: the mock replies by the kind, and the words matter only for the recorded ones.
	await page.goto('/sea/places?q=Malo');
	await expect(page.getByRole('heading', { level: 2, name: /« Malo »/ })).toBeVisible();
	await expect(page.getByText(`${malo.count} lieux`, { exact: true })).toBeVisible();
	await expect(page.locator('ul.places > li')).toHaveCount(malo.places.length);
	// A page of results found by words is not worth a search result.
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
	expect(errors).toEqual([]);
});

test('a port says what it is, what Vigie does not know, and answers from the surf spots around it, never for itself', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto(PORT);
	await expect(page).toHaveTitle(/Port de Saint-Malo · Lieux du littoral/);
	await expect(page.getByRole('heading', { level: 1, name: 'Port de Saint-Malo' })).toBeVisible();
	await expect(page.getByText('Port', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('Un catalogue, pas une prévision', { exact: false }).first()).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0); // a name of its own: worth a search result
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		/\/sea\/places\/port-port-de-saint-malo-f697$/
	);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute(
		'content',
		/Port de Saint-Malo.*pas une prévision/
	);

	// What it is: the API's uses, and the honest list of what is not known.
	const what = page.locator('section', { has: page.getByRole('heading', { name: 'Ce que c’est' }) });
	await expect(what).toContainText('Usages : pêche, plaisance, passagers, commerce.');
	await expect(what).toContainText('Vigie ne connaît ni la profondeur');
	await expect(what.getByRole('link', { name: 'Voir sur OpenStreetMap' })).toHaveAttribute(
		'href',
		/openstreetmap\.org\/\?mlat=48\.6429\d*&mlon=-2\.0235/
	);

	// The answer: said to be the spots', not the place's, with how far the spot is; the surf by default, four activities to switch.
	const answer = page.locator('section.answer');
	await expect(answer.getByRole('heading', { level: 2, name: 'Y aller aujourd’hui ?' })).toBeVisible();
	await expect(answer).toContainText('Vigie ne juge pas ce lieu');
	const pills = answer.getByRole('group', { name: 'Mon activité' });
	await expect(pills.getByRole('button')).toHaveCount(4);
	await expect(pills.getByRole('button', { name: /^Surf/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(answer.locator('.sentence')).toContainText('Rochebonne');
	await expect(answer.locator('.sentence')).toContainText(/\(\d+(,\d)? km\)/);
	await expect(answer.getByRole('link', { name: /^Le détail de / }).first()).toHaveAttribute(
		'href',
		/^\/surf\/[a-z0-9-]+$/
	);
	await expect(answer.getByRole('link', { name: /^Tous les spots pour cette activité/ })).toHaveAttribute(
		'href',
		'/sea/surf'
	);

	// One tap on another activity: kept in this browser (the same choice as the sea pages), and the link to its spots follows.
	await pills.getByRole('button', { name: /^Kite/ }).click();
	await expect(pills.getByRole('button', { name: /^Kite/ })).toHaveAttribute('aria-pressed', 'true');
	await expect(answer.getByRole('link', { name: /^Tous les spots pour cette activité/ })).toHaveAttribute(
		'href',
		'/sea/kite'
	);
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vigie-sea') ?? 'null').activity)).toBe(
		'kite'
	);

	// The places around, by kind, nearest first; the place itself is not among them.
	const around = page.locator('section', { has: page.getByRole('heading', { name: 'Autour de ce lieu' }) });
	await expect(around.getByRole('heading', { level: 3 })).toHaveText(['Ports', 'Cales', 'Baignade']);
	await expect(around.locator('a[href="/sea/places/port-port-de-saint-malo-f697"]')).toHaveCount(0);
	await expect(around.locator('a[href^="/sea/places/"]').first()).toContainText(/à \d/);
	await expect(around.getByText(/^\+ \d+ autres$/).first()).toBeVisible();

	// When the catalogue was built, its licences and its credits are in the page, in French: the English sentence of the API (its
	// caveats) is not, the page says the same at the top and in each section in its own words, and a licence says in French what it covers.
	await expect(page.getByText('Catalogue construit le 8 novembre 2026.')).toBeVisible();
	await expect(
		page.getByText(
			'Données et licences: ODbL-1.0 (OpenStreetMap), Licence Ouverte (Sandre), Licence Ouverte 2.0 (qualité des baignades)',
			{ exact: true }
		)
	).toBeVisible();
	await expect(page.getByText('not a forecast', { exact: false })).toHaveCount(0);
	await expect(page.getByText('bathing quality', { exact: false })).toHaveCount(0);
	await page.getByText('Sources de cette page').click();
	await expect(page.getByText('Sandre', { exact: false }).first()).toBeVisible();
	expect(await fits(page)).toBe(true);
	expect(errors).toEqual([]);
});

test('a bathing site gives the class of its water as a word and says it is not the water of today; the tide is there', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.goto(BATHING);
	await expect(page.getByRole('heading', { level: 1, name: 'Bon Secours' })).toBeVisible();
	const what = page.locator('section', { has: page.getByRole('heading', { name: 'Ce que c’est' }) });
	await expect(what).toContainText('Qualité de l’eau, 2021 à 2024 : Insuffisante');
	await expect(what).toContainText('pas l’état de l’eau aujourd’hui');
	// The class is a context, never a verdict: no verdict colour in what it is.
	await expect(what.locator('.hint, .v-good, .v-possible, .v-poor')).toHaveCount(0);
	// The tide of the position, computed by the API where the model has a cell.
	await expect(page.getByRole('heading', { level: 2, name: 'Marée' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('far from every surf spot, the page says so and names the nearest one with its distance', async ({
	page
}) => {
	await page.goto(DIVE);
	await expect(page.getByRole('heading', { level: 1, name: 'Pythéas' })).toBeVisible();
	await expect(page.getByText('Site de plongée', { exact: true }).first()).toBeVisible();
	const answer = page.locator('section.answer');
	await expect(answer.locator('.sentence')).toHaveText('Aucun spot jugé à moins de 60 km de ce lieu.');
	await expect(answer).toContainText(/Le spot jugé le plus proche est .+, à \d{3,} km\./);
	await expect(answer.getByRole('link', { name: /^Le détail de / })).toHaveAttribute(
		'href',
		/^\/surf\/[a-z0-9-]+$/
	);
	// No verdict sign in the pills: there is nothing to say about this place.
	await expect(answer.locator('.hint')).toHaveCount(0);
	await expect(
		page.locator('section', { has: page.getByRole('heading', { name: 'Ce que c’est' }) })
	).toContainText('ni la profondeur, ni le courant, ni la visibilité, ni l’accès');
});

test('a place without a name is titled by its kind and the nearest locality, and is not offered to search engines', async ({
	page
}) => {
	await page.goto(SLIPWAY);
	await expect(
		page.getByRole('heading', { level: 1, name: 'Cale de mise à l’eau près de Saint-Malo' })
	).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
	await expect(
		page.locator('section', { has: page.getByRole('heading', { name: 'Ce que c’est' }) })
	).toContainText('une cale qui n’est pas marquée fermée peut l’être en réalité');
});

test('an address that is not a place is a 404, without asking the API for it', async ({ request }) => {
	for (const path of [
		'/sea/places/port-inconnu-0000',
		'/sea/places/volcano-x-0000',
		'/sea/places/PORT-X-0000',
		'/sea/places/port-x',
		`/sea/places/port-${'a'.repeat(130)}-0000`
	])
		expect((await request.get(path)).status(), path).toBe(404);
});

test('the English page says the same, and a place is added to the page of the account by a plain link', async ({
	page
}) => {
	await page.goto(`${PORT}?lang=en`);
	await expect(page.getByRole('heading', { level: 1, name: 'Port de Saint-Malo' })).toBeVisible();
	await expect(page.getByText('A catalogue, not a forecast', { exact: false }).first()).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: 'Go there today?' })).toBeVisible();
	await expect(page.getByText('Uses: fishing, pleasure boats, passengers, trade.')).toBeVisible();
	await expect(page.getByText('Catalogue built on 8 November 2026.')).toBeVisible();
	await expect(
		page.getByText(
			'Data and licences: ODbL-1.0 (OpenStreetMap), Licence Ouverte (Sandre), Licence Ouverte 2.0 (bathing quality)',
			{ exact: true }
		)
	).toBeVisible();
	// Without accounts on this server the link is not offered (the e2e site runs with them: it is a plain link, no script).
	const add = page.getByRole('link', { name: 'Add to my page' });
	if (await add.count()) {
		await expect(add).toHaveAttribute('href', /^\/me\/places#48\.643,-2\.02[34],25$/);
		await expect(add).toHaveAttribute('rel', 'nofollow');
	}
});

test('around my position asks the site for a position rounded to a kilometre, and lists the places nearest first', async ({
	page
}) => {
	const errors = collectErrors(page);
	await page.addInitScript(() =>
		localStorage.setItem(
			'vigie-places',
			JSON.stringify([{ lat: 48.6491, lon: -2.0267, radiusKm: 25, name: 'Saint-Malo', profile: null }])
		)
	);
	const asked = page.waitForRequest((r) => r.url().includes('/data/sea-places.json'));
	await page.goto('/sea/places');
	const url = new URL((await asked).url());
	expect(url.searchParams.get('lat')).toBe('48.65');
	expect(url.searchParams.get('lon')).toBe('-2.03');
	expect(url.search).not.toContain('48.649');
	await expect(page.getByRole('heading', { level: 2, name: 'Autour de Saint-Malo' })).toBeVisible();
	const rows = page.locator('section[aria-live] ul.places > li');
	await expect(rows.first()).toContainText(/à \d/);
	expect(await rows.count()).toBeGreaterThan(5);
	// Each row says its kind; the first is the nearest.
	await expect(rows.first().locator('.kind')).toBeVisible();
	await page.getByRole('button', { name: 'Sans position' }).click();
	await expect(rows).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('the data of the page around me is the catalogue only: the position is required, the kind and the limit are brought within bounds', async ({
	request
}) => {
	expect((await request.get('/data/sea-places.json')).status()).toBe(400);
	expect((await request.get('/data/sea-places.json?lat=north&lon=1')).status()).toBe(400);
	const ok = await request.get('/data/sea-places.json?lat=48.65&lon=-2.03&limit=100000&type=volcano');
	expect(ok.status()).toBe(200);
	const body = await ok.json();
	expect(Array.isArray(body.places)).toBe(true);
	expect(body.places[0]).toMatchObject({ type: expect.any(String), lat: expect.any(Number) });
});

test('the sea page links to the catalogue, which is in the sitemap, and the navigation keeps saying Mer', async ({
	page,
	request
}) => {
	await page.goto('/sea');
	await page.getByRole('link', { name: /^Les lieux du littoral/ }).click();
	await expect(page).toHaveURL(/\/sea\/places$/);
	await expect(
		page.getByRole('navigation', { name: 'Vigie' }).getByRole('link', { name: 'Mer' })
	).toHaveAttribute('aria-current', 'page');
	const xml = await (await request.get('/sitemap.xml')).text();
	expect(xml).toContain('https://vigie.auxfilsdesidees.fr/sea/places</loc>');
});

test('when the catalogue does not answer, the page says so and invents no place', async ({ page }) => {
	// Not recorded: the mock answers 404, as an API that is down would fail.
	await page.goto('/sea/places?type=port');
	await expect(page.getByText('Le catalogue des lieux ne répond pas pour le moment.')).toBeVisible();
	await expect(page.locator('ul.places')).toHaveCount(0);
});
