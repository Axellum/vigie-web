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

const world = {} as { valid: string; revoked: string; homeOnly: string; english: string; moving: string };
let userIds: string[] = [];

test.beforeAll(async () => {
	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const account = async (lang: 'fr' | 'en') => {
			const [user] = await sql`
				insert into users (id, name, lang) values (gen_random_uuid(), ${`Écran ${lang} ${stamp}`}, ${lang}) returning id`;
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
			return { place, page, link };
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
		const lonely = await fr.page('Maison seule', [block('bbbb0001', 'weather', home)]);
		world.valid = await fr.link(page, 'Salon');
		world.revoked = await fr.link(page, 'Ancien écran', true);
		world.homeOnly = await fr.link(lonely, 'Maison');
		world.moving = await fr.link(page, 'Écran qui bouge');

		const en = await account('en');
		const shore = await en.place('North Beach', 43.6601, -1.4448);
		world.english = await en.link(
			await en.page('Harbour office', [block('cccc0001', 'weather', shore), block('cccc0002', 'sea', shore)]),
			'Office'
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
	// The four cards a screen draws, in the order of the page; the official card is not on a screen yet, the home never is.
	await expect(page.locator('#tv-panels > section')).toHaveCount(4);
	expect(
		await page.locator('#tv-panels > section').evaluateAll((s) => s.map((x) => x.getAttribute('data-panel')))
	).toEqual(['aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004']);
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
