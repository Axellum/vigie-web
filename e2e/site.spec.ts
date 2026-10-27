import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fixture = (name: string): Json =>
	JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf-8'));
const hazards = fixture('hazards');
// A storm and a tsunami, added by the mock API to the recorded hazards (see e2e/fixtures/index.json).
const storms = fixture('hazards-storms');
const isaias = fixture('forecast-nhc_al092026');
const panama = fixture('forecast-tsunami_pheb_26282000');
const fr = fixture('warnings-FR');
const point = fixture('point');

// The countries whose warnings were recorded. For any other one the mock answers 503 (a source that is down), the
// site 502: expected when the map moves over such a country (the Caribbean, for the storm), and not an error.
const recorded = new Set(
	readdirSync(join(import.meta.dirname, 'fixtures'))
		.map((name) => /^warnings-([A-Z]{2})\.json$/.exec(name)?.[1])
		.filter(Boolean)
);
const unrecordedWarnings = (url: string): boolean => {
	const cc = /\/data\/warnings\/([A-Z]{2})\.json$/.exec(new URL(url, 'http://x').pathname)?.[1];
	return cc != null && !recorded.has(cc);
};

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !unrecordedWarnings(m.location().url || '/')) errors.push(m.text());
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
	await expect(page.locator('.rail .list > .row')).toHaveCount(
		hazards.features.length + storms.features.length
	);
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
	// São Paulo: Brazil has a border but no source.
	await page.goto('/near#-23.55,-46.63,300');
	await expect(page.getByText(/Aucune source de vigilances officielles .* \(Brésil\)/)).toBeVisible({
		timeout: 15_000
	});
	// And why, as the API says it: its reason code in the site's words, its own sentence in English.
	const brazil = (fixture('vigilances-countries') as unknown as Json[]).find((c) => c.country === 'BR');
	if (brazil?.reason_code === 'licence_unverified') {
		await expect(page.getByText(/Pourquoi : Une source existe, mais sa licence/)).toBeVisible();
		if (brazil.reason)
			await expect(page.locator('[lang="en"]', { hasText: brazil.reason.slice(0, 40) })).toBeVisible();
	}
});

test('the covered countries are the ones the API serves', async ({ page, request }) => {
	const all = fixture('vigilances-countries') as unknown as Json[];
	const served = all.filter((c) => c.covered !== false);
	const japan = all.find((c) => c.country === 'JP');
	await page.goto('/countries');
	await expect(page.getByText(`${served.length} pays.`)).toBeVisible();
	await expect(page.getByRole('link', { name: /Mexique/ })).toBeVisible();
	// New Zealand's source has no confirmed reuse licence: the page says so.
	await expect(page.getByRole('link', { name: /Nouvelle-Zélande/ })).toContainText(
		'Licence de réutilisation non confirmée'
	);
	await expect(page.getByRole('link', { name: /Brésil/ })).toHaveCount(0);
	expect((await request.get('/country/mx')).status()).toBe(200);
	expect((await request.get('/country/jp')).status()).toBe(404);
	// The others, by reason: Japan's law reserves the warnings to its own service.
	await expect(
		page.getByRole('heading', { level: 2, name: 'Pays sans vigilances officielles ici' })
	).toBeVisible();
	if (japan?.reason_code === 'law_restricts')
		await expect(
			page.getByRole('heading', { level: 3, name: /La loi du pays réserve la diffusion des alertes/ })
		).toBeVisible();
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

test('near me tells the fires seen by satellite around the place, with their credit', async ({ page }) => {
	const fires = point.fires_nearby;
	await page.goto('/near#42.306,9.15,25');
	await expect(page.getByRole('heading', { level: 3, name: 'Feux vus par satellite' })).toBeVisible({
		timeout: 15_000
	});
	if (fires.count_24h === 0)
		await expect(page.getByText(`Aucune détection en 24 h à moins de ${fires.radius_km} km.`)).toBeVisible();
	else await expect(page.getByText(`Détections en 24 h à moins de ${fires.radius_km} km`)).toBeVisible();
	await expect(page.getByText(fires.attribution)).toBeVisible();
	await expect(page.getByText(fires.disclaimer)).toBeVisible();
});

test('the fires seen by satellite are off until asked, then drawn with their credit', async ({ page }) => {
	const errors = collectErrors(page);
	const grid = fixture('fires-grid');
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 2, name: /Alertes/ })).toBeVisible();
	await expect(page.getByText(grid.metadata.attribution)).toHaveCount(0);
	// The world, far away: the one tile of the coarsest grid.
	const tile = page.waitForResponse((r) => r.url().endsWith('/data/fires/w5/0_0.json'));
	await page.getByLabel('Feux vus par satellite (NASA)').check();
	const answer = await tile;
	expect(answer.status()).toBe(200);
	expect((await answer.json()).features.features).toHaveLength(grid.features.length);
	await expect(page.getByText(/Une détection n’est pas une alerte/).first()).toBeVisible();
	await expect(page.getByText(grid.metadata.attribution)).toBeVisible();
	await expect(page.getByText(grid.metadata.disclaimer)).toBeVisible();
	await page.getByLabel('Feux vus par satellite (NASA)').uncheck();
	await expect(page.getByText(grid.metadata.attribution)).toHaveCount(0);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('a tile of fires checks its level and place, and is cut down and cacheable', async ({ request }) => {
	expect((await request.get('/data/fires/nope/0_0.json')).status()).toBe(404);
	expect((await request.get('/data/fires/dots/180_0.json')).status()).toBe(404);
	expect((await request.get('/data/fires/w1/0_1.json')).status()).toBe(404);
	const raw = fixture('fires');
	const answer = await request.get('/data/fires/dots/104_37.json');
	expect(answer.status()).toBe(200);
	expect(answer.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await answer.json();
	expect(body.truncated).toBe(raw.metadata.truncated);
	expect(body.features.features).toHaveLength(raw.features.length);
	expect(body.features.features[0].properties.t).toBe(raw.features[0].properties.acq_utc);
	expect(JSON.stringify(body)).not.toContain('bright_ti4');
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

test('a storm shows its forecast in the panel and on its page', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/');
	await page.getByLabel('Seulement ce que montre la carte').uncheck();
	await page.locator('.rail .list > .row').filter({ hasText: 'Hurricane Isaias' }).first().click();
	await expect(page.getByRole('heading', { level: 3, name: 'Prévision' })).toBeVisible();
	await expect(page.getByText('Avis 13A', { exact: false })).toBeVisible();
	// One row per forecast position, with the source's own stage and wind.
	const positions = isaias.features.filter((f: Json) => f.properties.kind === 'position');
	await expect(page.locator('.forecast tbody tr')).toHaveCount(positions.length);
	await expect(page.locator('.forecast tbody tr').first()).toContainText('95 kt (176 km/h)');
	await expect(page.getByText('Hurricane Warning', { exact: true })).toBeVisible();

	await page.goto('/alert/nhc_al092026');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hurricane Isaias');
	await expect(page.getByRole('heading', { level: 2, name: 'Prévision' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Bulletin officiel' })).toHaveAttribute(
		'href',
		isaias.advisory_url
	);
	// The source is credited once, not once for the hazard and once for its forecast.
	await expect(page.getByText(isaias.attribution)).toHaveCount(1);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('a hazard page says what it is close to, as calculated by Vigie', async ({ page }) => {
	const near = hazards.features.find((f: Json) => f.properties.near_places?.length);
	const none = hazards.features.find(
		(f: Json) => Array.isArray(f.properties.near_places) && f.properties.near_places.length === 0
	);
	test.skip(!near || !none, 'the recording has no hazard with places near it, or none without');
	await page.goto(`/alert/${encodeURIComponent(near.id)}`);
	const first = near.properties.near_places[0];
	await expect(page.locator('.near li').first()).toContainText(first.name);
	await expect(page.locator('.near li')).toHaveCount(near.properties.near_places.length);
	await expect(page.getByText(/calculé par Vigie/)).toBeVisible();
	await page.goto(`/alert/${encodeURIComponent(none.id)}`);
	await expect(
		page.getByText('Aucune faille active nommée ni aucun volcan signalé à proximité')
	).toBeVisible();
	// A storm is compared with nothing: no line at all, rather than "nothing near".
	await page.goto('/alert/nhc_al092026');
	await expect(page.getByText('À proximité', { exact: true })).toHaveCount(0);
});

test('a tsunami page lists the estimated arrivals and the official message', async ({ page }) => {
	await page.goto('/alert/tsunami_pheb_26282000');
	await expect(page.getByRole('heading', { level: 3, name: 'Arrivées estimées' })).toBeVisible();
	for (const eta of panama.features.filter((f: Json) => f.properties.kind === 'eta'))
		await expect(page.getByText(`${eta.properties.place}, ${eta.properties.region}`)).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: "Messages officiels du centre d'alerte" })
	).toBeVisible();
	await expect(page.getByText('PTWC TSUNAMI THREAT MESSAGE').first()).toBeVisible();
});

test('the forecast answer is cacheable and says when there is none', async ({ request }) => {
	const answer = await request.get('/data/forecast/nhc_al092026.json');
	expect(answer.status()).toBe(200);
	expect(answer.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await answer.json();
	expect(body.advisory).toBe('13A');
	expect(body.features.features.length).toBe(isaias.features.length);
	expect((await request.get('/data/forecast/unknown.json')).status()).toBe(404);
	expect((await request.get('/data/forecast/bad%20id!.json')).status()).toBe(404);
});

test('robots.txt announces the sitemap, which lists the public pages only', async ({ request }) => {
	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain('Sitemap: https://vigie.auxfilsdesidees.fr/sitemap.xml');
	expect(robots).toContain('Disallow: /data/');
	expect(robots).toContain('Disallow: /account');

	const res = await request.get('/sitemap.xml');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('application/xml');
	const xml = await res.text();
	const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	const origin = 'https://vigie.auxfilsdesidees.fr';
	expect(new Set(locs).size).toBe(locs.length);
	for (const loc of locs) expect(loc.startsWith(`${origin}/`)).toBe(true);
	for (const path of ['/', '/near', '/countries', '/sources', '/about', '/privacy', '/country/fr']) {
		expect(locs).toContain(origin + path);
	}
	expect(locs.filter((l) => /\/(account|login|join|data|alert|warning)(\/|$)/.test(l))).toEqual([]);
	// Every country listed answers (it is served by the mock API).
	for (const loc of locs.filter((l) => l.includes('/country/')).slice(0, 3)) {
		expect((await request.get(new URL(loc).pathname)).status()).toBe(200);
	}
});

test('a page spelled with capitals redirects to its one lower-case address', async ({ request }) => {
	for (const [from, to] of [
		['/country/FR?lang=en', '/country/fr?lang=en'],
		['/country/fr/FINISTERE', '/country/fr/finistere']
	]) {
		const res = await request.get(from, { maxRedirects: 0 });
		expect(res.status()).toBe(301);
		expect(res.headers()['location']).toBe(to);
	}
});

test('an area with no warning in force is not indexed, and the language link is not followed', async ({
	page
}) => {
	await page.goto('/country/fr/made-up-area');
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
	await expect(page.locator('a.lang')).toHaveAttribute('rel', 'nofollow');
	await page.goto('/country/fr/haute-corse');
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('a public page carries its canonical address and a social preview', async ({ page }) => {
	await page.goto('/country/fr?lang=en');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://vigie.auxfilsdesidees.fr/country/fr'
	);
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /^Vigie · /);
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
