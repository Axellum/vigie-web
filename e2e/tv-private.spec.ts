import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';

// The screen of a personal page, opened by its private link (`/tv/p/<secret>`, ADR 0020 of vigie-api): the page of an account on a
// television, without signing in. The accounts, places, pages and links are written straight into the test database (the way a person
// makes them is accounts.spec.ts and src/lib/server/personalPage.db.test.ts), because the thing under test is what the link shows, and
// what it must never show: the home, the secret, anything of another site. This runs in the `accounts` project, with the other
// specs that write to the one database.
const SITE = 'http://localhost:4174';
const DATABASE_URL = 'postgres://postgres@127.0.0.1:15433/postgres';

const digest = (s: string) => createHash('sha256').update(s).digest();
const secret = () => randomBytes(24).toString('base64url');
const stamp = Date.now().toString(36);

const world = {} as {
	valid: string;
	revoked: string;
	homeOnly: string;
	english: string;
	moving: string;
	extraCards: string;
	imperial: string;
	frSession: string;
	frPageId: string;
};
let userIds: string[] = [];

test.beforeAll(async () => {
	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const account = async (lang: 'fr' | 'en', prefs: Record<string, unknown> = {}) => {
			const [user] = await sql`
				insert into users (id, name, lang, prefs)
				values (gen_random_uuid(), ${`Écran ${lang} ${stamp}`}, ${lang}, ${sql.json(prefs as never)})
				returning id`;
			userIds.push(user.id);
			const place = async (
				name: string,
				lat: number,
				lon: number,
				kind = 'place',
				profile: string | null = null
			) =>
				(
					await sql`
						insert into places (id, user_id, name, kind, lat, lon, profile)
						values (gen_random_uuid(), ${user.id}, ${name}, ${kind}, ${lat}, ${lon}, ${profile}) returning id`
				)[0].id as string;
			const page = async (title: string, blocks: object[]) =>
				(
					await sql`
						insert into pages (id, user_id, title, blocks)
						values (gen_random_uuid(), ${user.id}, ${title}, ${sql.json(blocks as never)}) returning id`
				)[0].id as string;
			const link = async (pageId: string, label: string, revoked = false) => {
				const s = secret();
				await sql`
					insert into page_links (token_hash, page_id, user_id, label, revoked_at)
					values (${digest(s)}, ${pageId}, ${user.id}, ${label}, ${revoked ? sql`now()` : null})`;
				return s;
			};
			const session = async () => {
				const raw = secret();
				await sql`
					insert into sessions (token_hash, user_id, expires_at)
					values (${digest(raw)}, ${user.id}, now() + interval '1 day')`;
				return raw;
			};
			return { place, page, link, session };
		};
		const block = (id: string, type: string, place: string) => ({ id, type, place, size: 'm' });

		const fr = await account('fr');
		// The beach is the cell the mock API answers with the sea (the Hossegor spot); the home is a place of kind 'home', stored to
		// two decimals, with a name nobody must ever read on a screen.
		const beach = await fr.place('Plage Sud', 43.6601, -1.4448, 'place', 'surf');
		const home = await fr.place('Chez Dominique', 43.67, -1.44, 'home');
		const page = await fr.page('Salon des Landes', [
			block('aaaa0001', 'weather', beach),
			block('aaaa0002', 'sea', beach),
			block('aaaa0003', 'tide', beach),
			block('aaaa0004', 'air', beach),
			block('aaaa0005', 'official', beach),
			block('aaaa0006', 'weather', home)
		]);
		const extras = await fr.page('Tout voir', [
			block('dddd0001', 'official', beach),
			block('dddd0002', 'hazards', beach),
			block('dddd0003', 'surf', beach),
			block('dddd0004', 'sky', beach)
		]);
		const lonely = await fr.page('Maison seule', [block('bbbb0001', 'weather', home)]);
		world.frPageId = page;
		world.frSession = await fr.session();
		world.valid = await fr.link(page, 'Salon');
		world.revoked = await fr.link(page, 'Ancien écran', true);
		world.homeOnly = await fr.link(lonely, 'Maison');
		world.moving = await fr.link(page, 'Écran qui bouge');
		world.extraCards = await fr.link(extras, 'Toutes les cartes');

		const en = await account('en');
		const shore = await en.place('North Beach', 43.6601, -1.4448);
		world.english = await en.link(
			await en.page('Harbour office', [block('cccc0001', 'weather', shore), block('cccc0002', 'sea', shore)]),
			'Office'
		);

		const imp = await account('en', { units: { temperature: 'f', wind: 'mph', height: 'ft' } });
		const impShore = await imp.place('West Pier', 43.6601, -1.4448);
		world.imperial = await imp.link(
			await imp.page('Pier Units', [
				block('eeee0001', 'weather', impShore),
				block('eeee0002', 'sea', impShore),
				block('eeee0003', 'tide', impShore)
			]),
			'Pier'
		);
	} finally {
		await sql.end();
	}
});

test.afterAll(async () => {
	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		// The pages, places and links go with their account.
		await sql`delete from users where id = any(${userIds})`;
	} finally {
		await sql.end();
	}
});

test('a private link shows the page of its account, in its order, never the home, and nothing of the secret', async ({
	page
}) => {
	const seen: Promise<{ url: string; referer: string | undefined }>[] = [];
	page.on('request', (r) => seen.push(r.allHeaders().then((h) => ({ url: r.url(), referer: h['referer'] }))));

	const response = await page.goto(`/tv/p/${world.valid}`);
	expect(response!.status()).toBe(200);
	// Set by the hooks of the site, not by the route: no referrer, not kept by any cache, not indexed.
	expect(response!.headers()['referrer-policy']).toBe('no-referrer');
	expect(response!.headers()['cache-control']).toBe('private, no-store');
	expect(response!.headers()['x-robots-tag']).toBe('noindex, nofollow');

	await expect(page).toHaveTitle('Vigie · TV');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
	await expect(page.locator('.tv-place-page')).toHaveText('Salon des Landes');
	// Five cards are drawn in the order of the page (including official); the home is never included.
	await expect(page.locator('#tv-panels > section')).toHaveCount(5);
	expect(
		await page.locator('#tv-panels > section').evaluateAll((s) => s.map((x) => x.getAttribute('data-panel')))
	).toEqual(['aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004', 'aaaa0005']);
	const shown = page.locator('.tv-panel.tv-on');
	await expect(shown).toContainText('Plage Sud');
	await expect(shown).toContainText('Météo');
	await expect(shown).toContainText('21°');
	await expect(page.locator('#tv-clock')).toHaveText(/^\d\d:\d\d$/);

	const html = await page.content();
	expect(html).not.toContain('Chez Dominique');
	expect(html).not.toContain(world.valid);

	// Nothing left the site, and no request said where it came from (a log keeps a referrer, and the address is the secret).
	for (const r of await Promise.all(seen)) {
		expect(new URL(r.url).origin, r.url).toBe(SITE);
		expect(r.referer, r.url).toBeUndefined();
	}
});

test('every card of the page takes its turn, with its own figures', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`/tv/p/${world.valid}?d=5`);
	const on = page.locator('.tv-panel.tv-on');
	await expect(on).toContainText('Météo');
	await page.clock.runFor(5_500);
	await expect(on).toContainText('Mer');
	await expect(on).toContainText('Houle');
	await expect(on).toContainText('eau');
	await expect(on).toContainText('valeur du modèle');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Marée');
	// The recorded tide is replayed moved by whole days and read at the hour the test runs: the card says the direction it has then.
	await expect(on).toContainText(/montante|descendante/);
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Qualité de l’air');
	await expect(on).toContainText('indice européen');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Vigilances');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Météo'); // and round again
});

test('a link that was revoked, never existed or is badly formed answers 404, and the same page', async ({
	request
}) => {
	// What differs from one answer to the next without meaning anything: the nonce of the inline scripts.
	const plain = (html: string) => html.replace(/nonce="[^"]*"/g, 'nonce=""');
	const bodies: string[] = [];
	for (const token of [world.revoked, secret(), 'short', 'x'.repeat(40), `${world.valid}x`]) {
		const answer = await request.get(`/tv/p/${token}`);
		expect(answer.status(), token).toBe(404);
		// An address that holds a secret keeps its headers even when the answer is "not found".
		expect(answer.headers()['referrer-policy']).toBe('no-referrer');
		expect(answer.headers()['cache-control']).toBe('private, no-store');
		const body = await answer.text();
		// The page does not repeat the address it was asked for (a short word is in the page anyway: only a whole secret counts).
		if (token.length >= 32) expect(body).not.toContain(token);
		bodies.push(plain(body));
	}
	expect(new Set(bodies).size, 'the five answers must not differ').toBe(1);
});

test('a page made of the home alone shows a message, not an error, and not the home', async ({ page }) => {
	const response = await page.goto(`/tv/p/${world.homeOnly}`);
	expect(response!.status()).toBe(200);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'unavailable');
	await expect(page.getByText('Rien à afficher ici pour l’instant')).toBeVisible();
	expect(await page.content()).not.toContain('Chez Dominique');
});

test('a screen speaks the language of the account, not of the television', async ({ page }) => {
	await page.goto(`/tv/p/${world.english}`);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-lang', 'en');
	await expect(page.locator('.tv-place-page')).toHaveText('Harbour office');
	await expect(page.locator('.tv-panel.tv-on')).toContainText('North Beach');
	await expect(page.locator('.tv-panel.tv-on')).toContainText('Weather');
});

test('the screen keeps its last value when the site does not answer, and leaves when the link is revoked', async ({
	page
}) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`/tv/p/${world.moving}?r=60`);
	await expect(page.locator('.tv-panel.tv-on')).toContainText('Plage Sud');

	// The site is down: the screen stays, and says it is offline.
	const own = new RegExp(`/tv/p/${world.moving}`);
	await page.route(own, (route) => route.abort());
	await page.clock.runFor(70_000);
	await expect(page.locator('#tv-banner')).toHaveClass(/tv-banner-on/);
	await expect(page.locator('.tv-panel.tv-on')).toContainText('Plage Sud');
	await expect(page.locator('#tv-clock')).toHaveText(/^\d\d:\d\d$/);

	// The link is revoked: the site answers 404, and the screen asks the page itself instead of staying on a dead link.
	await page.unroute(own);
	let navigations = 0;
	await page.route(own, (route) => {
		if (route.request().isNavigationRequest()) navigations++;
		return route.fulfill({ status: 404, contentType: 'text/html', body: '<html><body>gone</body></html>' });
	});
	await page.clock.runFor(70_000);
	await expect(page.locator('body')).toHaveText('gone');
	expect(navigations).toBeGreaterThan(0);
});

test('official, hazards, surf and sky cards render on a private link screen', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`/tv/p/${world.extraCards}?d=5`);
	const on = page.locator('.tv-panel.tv-on');
	await expect(on).toContainText('Vigilances');
	await page.clock.runFor(5_500);
	await expect(on).toContainText('Dangers');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Surf');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Ciel');
	await expect(on).toContainText('Aurores boréales');
	await expect(on).toContainText('estimation');
});

test('a private screen applies the temperature, wind and height units of its account', async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await page.goto(`/tv/p/${world.imperial}?d=5`);
	const on = page.locator('.tv-panel.tv-on');
	// 20.8 °C -> 69°F; wind in mph rather than knots.
	await expect(on).toContainText('69°F');
	await expect(on).toContainText('mph');
	await page.clock.runFor(5_500);
	await expect(on).toContainText('Sea');
	await expect(on).toContainText('ft');
	await page.clock.runFor(5_000);
	await expect(on).toContainText('Tide');
	await expect(on).toContainText('ft');
});

test('pairing from /tv/pair opens the personal page once claimed on /me', async ({ page, browser }) => {
	await page.goto('/tv/pair');
	const codeEl = page.locator('#tv-pair-code');
	await expect(codeEl).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
	const code = (await codeEl.innerText()).trim();

	const ownerCtx = await browser.newContext();
	await ownerCtx.route(`${SITE}/**`, (route) =>
		route.continue({ headers: { ...route.request().headers(), 'x-forwarded-proto': 'http' } })
	);
	await ownerCtx.addCookies([{ name: 'vigie-session', value: world.frSession, url: SITE }]);
	const ownerPage = await ownerCtx.newPage();
	await ownerPage.goto(`/me?page=${world.frPageId}#pair=${encodeURIComponent(code)}`);
	await expect(ownerPage.locator('details.links')).toHaveAttribute('open', '');
	await ownerPage.getByRole('button', { name: 'Envoyer à l’écran' }).click();
	await expect(
		ownerPage.getByText('Écran appairé : la télé va ouvrir votre page dans quelques secondes.')
	).toBeVisible();
	await ownerCtx.close();

	await expect(page).toHaveURL(/\/tv\/p\/[A-Za-z0-9_-]{32}$/, { timeout: 15_000 });
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
	await expect(page.locator('.tv-place-page')).toHaveText('Salon des Landes');
});
