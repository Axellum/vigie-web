import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes, type ECDH } from 'node:crypto';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Accounts: invitation, passkey, sign-in, export, deletion, notifications. The passkeys are made by Chromium's
// virtual authenticator; the invitations by the script the owner uses (scripts/invite.mjs), on the test
// database; the notifications go to e2e/mock-push.mjs.
const SITE = 'http://localhost:4174';
const DATABASE_URL = 'postgres://postgres@127.0.0.1:15433/postgres';
const PUSH = 'http://127.0.0.1:18282';
// What a browser does with a notification (RFC 8291), by the library web-push itself encrypts with.
const ece = createRequire(import.meta.url)('http_ece') as {
	decrypt(body: Buffer, params: { version: string; privateKey: ECDH; authSecret: string }): Buffer;
};

function invite(...args: string[]): string {
	const out = execFileSync(process.execPath, ['scripts/invite.mjs', ...args], {
		env: { ...process.env, DATABASE_URL, ORIGIN: SITE },
		encoding: 'utf-8'
	});
	const link = out.split('\n').find((line) => line.startsWith(`${SITE}/join/`));
	if (!link) throw new Error(`no link in: ${out}`);
	return link.slice(SITE.length).trim();
}

/** A passkey authenticator for this page, as a phone or a computer would be. */
async function authenticator(page: Page): Promise<void> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
}

async function createAccount(page: Page, name: string): Promise<void> {
	await page.goto(invite(`e2e ${name}`));
	await page.getByLabel('Votre nom dans Vigie').fill(name);
	await page.getByRole('button', { name: 'Créer le compte avec une passkey' }).click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

// The forms and passkeys are checked against the site's origin, whose scheme SvelteKit 3 takes from
// X-Forwarded-Proto (PROTOCOL_HEADER in playwright.config.ts), as Caddy sends it in production; without it the
// server would believe it is on https. Added to the site's requests only: on the map's tiles it would turn them
// into cross-origin requests that need a preflight.
const PROXY = { 'x-forwarded-proto': 'http' };
const forwardedProto = (context: BrowserContext) =>
	context.route(`${SITE}/**`, (route) =>
		route.continue({ headers: { ...route.request().headers(), ...PROXY } })
	);
test.beforeEach(({ context }) => forwardedProto(context));

const unique = (prefix: string) => `${prefix} ${randomBytes(3).toString('hex')}`;

/** Two circle zones for an account, written with the simple query protocol: the test database serves one PostgreSQL
 *  session to everybody, and a statement in several steps can be cut by the site's own queries ("portal does not exist"). */
async function seedZones(sql: postgres.Sql, userId: string): Promise<void> {
	for (const [zone, lat, lon, radius, profile] of [
		['Plage', 43.66, -1.44, 50, 'surf'],
		['Maison', 48.85, 2.35, 25, null]
	] as const)
		await sql.unsafe(`
			insert into zones (id, user_id, name, kind, lat, lon, radius_km, profile, kinds, geom)
			values (gen_random_uuid(), '${userId}', '${zone}', 'circle', ${lat}, ${lon}, ${radius},
				${profile ? `'${profile}'` : 'null'}, '{VIGILANCE}',
				ST_Buffer(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radius * 1000})::geography(Polygon, 4326))`);
}

async function cookieNames(context: BrowserContext): Promise<string[]> {
	return (await context.cookies()).map((c) => c.name).sort();
}

test('an invitation opens an account with a passkey, which signs in again', async ({ page, context }) => {
	await authenticator(page);
	const name = unique('Camille');
	const path = invite('e2e first');
	await page.goto(path);
	await expect(page.getByText(/Invitation valable jusqu’au/)).toBeVisible();
	await page.getByLabel('Votre nom dans Vigie').fill(name);
	await page.getByRole('button', { name: 'Créer le compte avec une passkey' }).click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await expect(page.locator('.keys li')).toHaveCount(1);

	// The one cookie of an account: HttpOnly, SameSite=Lax.
	expect(await cookieNames(context)).toEqual(['vigie-session']);
	const session = (await context.cookies()).find((c) => c.name === 'vigie-session')!;
	expect(session.httpOnly).toBe(true);
	expect(session.sameSite).toBe('Lax');

	// The account page is never cached.
	const answer = await page.request.get('/account');
	expect(answer.headers()['cache-control']).toBe('private, no-store');

	// An invitation is used once.
	await page.goto(path);
	await expect(page.getByText('Cette invitation n’est plus valable')).toBeVisible();

	await page.goto('/account');
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(`${SITE}/`);
	await page.goto('/account');
	await expect(page).toHaveURL(/\/login$/);
	await page.getByRole('button', { name: 'Se connecter avec une passkey' }).click();
	await expect(page).toHaveURL(/\/account$/);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await expect(page.locator('.keys li')).toContainText('Dernière utilisation');
});

test('the data of an account can be downloaded, and deleting it leaves nothing', async ({ page }) => {
	await authenticator(page);
	const name = unique('Dominique');
	await createAccount(page, name);

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		expect(user).toBeTruthy();

		// What the person keeps for "My page": a place, a page, and a private link to it.
		const [pageRow] = await sql`
			insert into pages (id, user_id, title) values (gen_random_uuid(), ${user.id}, 'Ma page') returning id`;
		await sql`
			insert into places (id, user_id, name, lat, lon) values (gen_random_uuid(), ${user.id}, 'Plage', 43.666, -1.445)`;
		await sql`
			insert into page_links (token_hash, page_id, user_id, label)
			values (decode('0a0b0c', 'hex'), ${pageRow.id}, ${user.id}, 'Cuisine')`;

		const exported = await (await page.request.get('/account/export.json')).json();
		expect(exported.account.name).toBe(name);
		expect(exported.passkeys).toHaveLength(1);
		expect(JSON.stringify(exported)).not.toContain('public_key');
		expect(exported.places).toMatchObject([{ name: 'Plage', kind: 'place', lat: 43.666, lon: -1.445 }]);
		expect(exported.pages).toMatchObject([{ title: 'Ma page', blocks: [] }]);
		expect(exported.page_links).toMatchObject([{ label: 'Cuisine', revoked_at: null }]);
		expect(exported.account.prefs).toEqual({});
		// The secret of a link is never exported, not even its fingerprint.
		expect(JSON.stringify(exported)).not.toContain('token_hash');
		expect(JSON.stringify(exported)).not.toContain('0a0b0c');

		// The box must be ticked.
		await page.getByRole('button', { name: 'Supprimer le compte' }).click();
		await expect(page.getByText('Cochez la case pour confirmer.')).toBeVisible();
		await page.getByLabel('Je veux supprimer mon compte').check();
		await page.getByRole('button', { name: 'Supprimer le compte' }).click();
		await expect(page).toHaveURL(/\/login\?deleted=1$/);
		await expect(page.getByText('Votre compte a été supprimé')).toBeVisible();

		const left = await sql`
			select (select count(*) from users where id = ${user.id})::int as users,
				(select count(*) from passkeys where user_id = ${user.id})::int as passkeys,
				(select count(*) from sessions where user_id = ${user.id})::int as sessions,
				(select count(*) from places where user_id = ${user.id})::int as places,
				(select count(*) from pages where user_id = ${user.id})::int as pages,
				(select count(*) from page_links where user_id = ${user.id})::int as page_links`;
		expect(left[0]).toEqual({ users: 0, passkeys: 0, sessions: 0, places: 0, pages: 0, page_links: 0 });
	} finally {
		await sql.end();
	}

	// The passkey still on the device no longer opens anything.
	await page.getByRole('button', { name: 'Se connecter avec une passkey' }).click();
	await expect(page.getByText('Cette passkey n’est pas connue du site')).toBeVisible();
});

test('"My page" is made from the zones followed, one place at a time, and only its owner reads it', async ({
	page
}) => {
	await authenticator(page);
	const name = unique('Camille');
	await createAccount(page, name);

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		await seedZones(sql, user.id);

		// The header leads to it; the page is private and made once from the zones.
		await page.getByRole('link', { name: 'Ma page' }).click();
		await expect(page).toHaveURL(/\/me$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Ma page' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: /^Plage/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Maison/ })).toBeVisible();
		// Cards of both places, each titled with its place.
		const weather = page.getByRole('region', { name: /^Météo · Maison/ });
		await expect(weather).toBeVisible();
		await expect(weather).toContainText('°C');
		await expect(page.getByRole('region', { name: /^Surf · .* · Plage/ })).toBeVisible();
		const made = await sql`select (select count(*) from places where user_id = ${user.id})::int as places,
			(select count(*) from pages where user_id = ${user.id})::int as pages`;
		expect(made[0]).toEqual({ places: 2, pages: 1 });

		// One place alone: no place name in the titles, the address keeps the choice, the sentence appears.
		await page.getByRole('button', { name: /^Maison/ }).click();
		await expect(page).toHaveURL(/\/me\?place=[0-9a-f-]{36}$/);
		await expect(page.getByRole('region', { name: 'Météo', exact: true })).toBeVisible();
		await expect(page.getByRole('region', { name: /Plage/ })).toHaveCount(0);
		await expect(page.locator('.sentence')).toContainText('17 °C');
		await page.reload();
		await expect(page.getByRole('button', { name: /^Maison/ })).toHaveAttribute('aria-pressed', 'true');

		// Opening it again does not make it again.
		const again = await sql`select (select count(*) from places where user_id = ${user.id})::int as places,
			(select count(*) from pages where user_id = ${user.id})::int as pages`;
		expect(again[0]).toEqual({ places: 2, pages: 1 });

		// Private: never cached, and without a session it leads to the sign-in page.
		const response = await page.request.get('/me');
		expect(response.headers()['cache-control']).toBe('private, no-store');
		await page.context().clearCookies();
		await page.goto('/me');
		await expect(page).toHaveURL(/\/login$/);
	} finally {
		await sql.end();
	}
});

test('the page is composed: add, move, resize and remove blocks, saved when done, dropped when cancelled', async ({
	page
}) => {
	await authenticator(page);
	const name = unique('Alix');
	await createAccount(page, name);

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		await seedZones(sql, user.id);
		const stored = async () => {
			const [row] = await sql`select title, blocks from pages where user_id = ${user.id}`;
			return row as { title: string; blocks: { id: string; type: string; place: string; size: string }[] };
		};

		await page.goto('/me');
		await expect(page.getByRole('heading', { level: 1, name: 'Ma page' })).toBeVisible();
		const first = await stored();
		const count = first.blocks.length;
		expect(count).toBeGreaterThanOrEqual(5);

		// Composing shows every block with its tools; nothing is sent until "Terminer".
		await page.getByRole('button', { name: 'Modifier' }).click();
		await expect(page.getByRole('button', { name: 'Terminer' })).toBeVisible();
		const names = page.locator('.tools .name');
		await expect(names).toHaveCount(count);
		const [one, two] = [await names.nth(0).innerText(), await names.nth(1).innerText()];
		const last = await names.nth(count - 1).innerText();

		await page.getByRole('button', { name: `Descendre : ${one}` }).click();
		await expect(names.nth(0)).toHaveText(two);
		await expect(names.nth(1)).toHaveText(one);
		await expect(page.getByRole('status')).toContainText('position 2');
		// The button used keeps the focus, so that the block can be moved again from the keyboard.
		await expect(page.getByRole('button', { name: `Descendre : ${one}` })).toBeFocused();

		await page.getByRole('group', { name: one, exact: true }).getByRole('button', { name: 'Grand' }).click();
		await expect(page.locator('.block.size-l')).toHaveCount(1);
		await page.getByRole('button', { name: `Retirer : ${last}` }).click();
		await expect(names).toHaveCount(count - 1);

		await page.getByRole('button', { name: '+ Ajouter un bloc' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.getByRole('radio', { name: 'Air' }).check();
		await page.getByRole('radio', { name: 'Maison' }).check();
		await page.getByRole('dialog').getByRole('button', { name: 'Ajouter' }).click();
		await expect(names).toHaveCount(count);
		await expect(names.nth(count - 1)).toHaveText('Air · Maison');
		expect((await stored()).blocks).toEqual(first.blocks); // nothing saved yet

		// A phone: the tools are touchable and nothing overflows.
		await page.setViewportSize({ width: 375, height: 812 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		const tool = await page.getByRole('button', { name: `Retirer : Air · Maison` }).boundingBox();
		expect(tool?.width).toBeGreaterThanOrEqual(44);
		expect(tool?.height).toBeGreaterThanOrEqual(44);
		await page.setViewportSize({ width: 1280, height: 720 });

		// Done: saved, in the order, the size and the cards chosen, and the page reads it again.
		await page.getByLabel('Titre de la page').fill('Ma côte');
		await page.getByRole('button', { name: 'Terminer' }).click();
		await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 1, name: 'Ma côte' })).toBeVisible();
		const saved = await stored();
		expect(saved.title).toBe('Ma côte');
		expect(saved.blocks).toHaveLength(count);
		expect(saved.blocks[0].id).toBe(first.blocks[1].id);
		expect(saved.blocks[1]).toMatchObject({ id: first.blocks[0].id, size: 'l' });
		expect(saved.blocks.at(-1)).toMatchObject({ type: 'air', size: 'm' });
		expect(saved.blocks.some((b) => b.id === first.blocks.at(-1)!.id)).toBe(false);
		await page.reload();
		await expect(page.getByRole('region', { name: /^Air · Maison/ })).toBeVisible();

		// Cancel drops what was done.
		await page.getByRole('button', { name: 'Modifier' }).click();
		await page
			.getByRole('button', { name: /^Retirer : / })
			.first()
			.click();
		await expect(page.getByText('Modifications non enregistrées.')).toBeVisible();
		await page.getByRole('button', { name: 'Annuler' }).click();
		await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible();
		expect((await stored()).blocks).toEqual(saved.blocks);

		// A block whose place is gone is not shown.
		await sql`delete from places where user_id = ${user.id} and name = 'Maison'`;
		await page.reload();
		await expect(page.getByRole('region', { name: /Maison/ })).toHaveCount(0);
	} finally {
		await sql.end();
	}
});

test('my places: a home kept to about 1 km, a place found by name with its first cards, edited, deleted', async ({
	page
}) => {
	await authenticator(page);
	const name = unique('Noa');
	await createAccount(page, name);

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		const places = async () =>
			(await sql`select id, name, kind, lat, lon, radius_km, public from places where user_id = ${user.id} order by kind desc, position`) as unknown as {
				id: string;
				name: string;
				kind: string;
				lat: number;
				lon: number;
				radius_km: number;
				public: boolean;
			}[];
		const blocks = async () =>
			((await sql`select blocks from pages where user_id = ${user.id}`)[0]?.blocks ?? []) as {
				place: string;
			}[];

		// An account with no place: the page says where to start.
		await page.goto('/me');
		await page.getByRole('link', { name: 'Ajouter un lieu' }).click();
		await expect(page).toHaveURL(/\/me\/places$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Mes lieux' })).toBeVisible();
		await expect(page.getByText('Aucun autre lieu pour l’instant.')).toBeVisible();

		// The home: the point is shown as it is kept, to about 1 km, and stored so; nothing is sent before "Enregistrer".
		await page.getByRole('button', { name: 'Indiquer ma maison' }).click();
		await expect(page.getByLabel('Nom du lieu')).toHaveValue('Maison');
		await page.getByLabel('Chercher un lieu').fill('Corte');
		await page
			.getByRole('button', { name: /^Corte/ })
			.first()
			.click();
		await expect(page.locator('#picked')).toContainText(/à environ 1 km près : 42\.3\d, 9\.1\d$/);
		expect(await places()).toHaveLength(0);
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.locator('.status')).toHaveText('Votre maison est enregistrée.');
		const [home] = await places();
		expect(home).toMatchObject({ name: 'Maison', kind: 'home', radius_km: 25, public: false });
		expect(Math.round(home.lat * 100) / 100).toBe(home.lat);
		expect(Math.round(home.lon * 100) / 100).toBe(home.lon);
		expect((await blocks()).filter((b) => b.place === home.id)).toHaveLength(3);

		// A place found by name, its radius chosen, its first cards put on the page.
		await page.getByRole('button', { name: '+ Ajouter un lieu' }).click();
		await page.getByLabel('Chercher un lieu').fill('Corte');
		await page
			.getByRole('button', { name: /^Corte/ })
			.first()
			.click();
		await expect(page.getByLabel('Nom du lieu')).toHaveValue(/^Corte, /);
		await page.getByLabel('Rayon regardé').selectOption('10');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.locator('.status')).toHaveText('Le lieu est ajouté.');
		const added = (await places()).find((p) => p.kind === 'place')!;
		expect(added).toMatchObject({ radius_km: 10, public: false });
		expect(Math.round(added.lat * 1000) / 1000).toBe(added.lat);
		expect((await blocks()).filter((b) => b.place === added.id)).toHaveLength(3);

		// Edited: the name changes, the point stays.
		await page.getByRole('button', { name: `Modifier ${added.name}` }).click();
		await page.getByLabel('Nom du lieu').fill('Mon coin');
		await page.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(page.locator('.status')).toHaveText('Le lieu est modifié.');
		const edited = (await places()).find((p) => p.id === added.id)!;
		expect(edited).toMatchObject({ name: 'Mon coin', lat: added.lat, lon: added.lon, radius_km: 10 });

		// A phone: the editor fits, and what is asked before a deletion is not a pop-up.
		await page.getByRole('button', { name: 'Modifier Mon coin' }).click();
		await page.setViewportSize({ width: 375, height: 812 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.getByRole('button', { name: 'Annuler' }).click();

		// Deleted only once confirmed, and its cards leave the page with it.
		await page.getByRole('button', { name: 'Supprimer Mon coin' }).click();
		await expect(page.getByText('Supprimer « Mon coin » ?')).toBeVisible();
		await page.getByRole('button', { name: 'Non, garder' }).click();
		expect(await places()).toHaveLength(2);
		await page.getByRole('button', { name: 'Supprimer Mon coin' }).click();
		await page.getByRole('button', { name: 'Oui, supprimer' }).click();
		await expect(page.locator('.status')).toHaveText('Le lieu est supprimé.');
		expect((await places()).map((p) => p.kind)).toEqual(['home']);
		expect((await blocks()).every((b) => b.place === home.id)).toBe(true);

		// The page itself reads the places again, and the home is a place like the others there.
		await page.getByRole('link', { name: 'Ma page' }).first().click();
		await expect(
			page.getByRole('navigation', { name: 'Vos lieux' }).getByRole('button', { name: 'Maison' })
		).toBeVisible();
	} finally {
		await sql.end();
	}
});

test('a recovery invitation adds a passkey to an account; the last one cannot be removed', async ({
	page,
	browser
}) => {
	await authenticator(page);
	const name = unique('Sacha');
	await createAccount(page, name);
	await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(0);

	const sql = postgres(DATABASE_URL, { max: 1 });
	const [user] = await sql`select id from users where name = ${name}`;
	await sql.end();
	const listed = execFileSync(process.execPath, ['scripts/invite.mjs', '--list'], {
		env: { ...process.env, DATABASE_URL, ORIGIN: SITE },
		encoding: 'utf-8'
	});
	expect(listed).toContain(`${user.id}  ${name}`);

	// Another device, with no passkey yet.
	const other = await browser.newContext();
	await forwardedProto(other);
	const phone = await other.newPage();
	await authenticator(phone);
	await phone.goto(invite('--recover', user.id, 'new phone'));
	await expect(phone.getByRole('heading', { level: 1 })).toHaveText(
		`Ajouter une passkey au compte « ${name} »`
	);
	await phone.getByRole('button', { name: 'Ajouter une passkey sur cet appareil' }).click();
	await expect(phone).toHaveURL(/\/account$/);
	await expect(phone.locator('.keys li')).toHaveCount(2);
	await phone.getByRole('button', { name: 'Retirer' }).first().click();
	await expect(phone.getByText('Passkey retirée.')).toBeVisible();
	await expect(phone.locator('.keys li')).toHaveCount(1);
	await expect(phone.getByRole('button', { name: 'Retirer' })).toHaveCount(0);
	await other.close();
});

test('without an account: sign-in page, invalid invitation, links, and no cross-site call', async ({
	page,
	request
}) => {
	await page.goto('/account');
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByText('Les comptes sont ouverts sur invitation seulement.')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Compte' })).toBeVisible();

	await page.goto('/join/AAAAAAAAAAAAAAAAAAAAAAAA');
	await expect(page.getByText('Cette invitation n’est plus valable')).toBeVisible();

	await page.goto('/privacy');
	await expect(page.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeVisible();
	await expect(page.getByText(/Pas d'adresse e-mail, pas de mot de passe, pas d'adresse IP/)).toBeVisible();

	const crossSite = await request.post('/account/passkey/login-options', {
		data: {},
		headers: { origin: 'https://example.org' }
	});
	expect(crossSite.status()).toBe(403);
	expect((await request.get('/account/export.json')).status()).toBe(401);
});

test('the account page fits a phone', async ({ page }) => {
	await page.setViewportSize({ width: 412, height: 915 });
	await authenticator(page);
	await createAccount(page, unique('Alix'));
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
	await expect(page.getByRole('button', { name: 'Ajouter une passkey sur cet appareil' })).toBeVisible();
});

test('zones: a place from near me, a country, a drawn zone; checked, exported, deleted', async ({ page }) => {
	await authenticator(page);
	const name = unique('Lou');
	await createAccount(page, name);

	// A place and a radius, from "near me" (Corte, 25 km).
	await page.goto('/near#42.306,9.15,25');
	await page.getByRole('link', { name: 'Surveiller cet endroit (25 km) dans mon compte' }).click();
	await expect(page).toHaveURL(/\/account\/zones\/new#42\.306,9\.15,25$/);
	await expect(page.getByText('Endroit choisi : 42.306, 9.150')).toBeVisible();
	await page.getByLabel('Nom de la zone').fill('Corte');
	await page.getByLabel('Niveau le plus bas').selectOption('ORANGE');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	await expect(page).toHaveURL(/\/account#zones$/);
	await expect(page.locator('.zones li').filter({ hasText: 'Corte' })).toContainText(
		'25 km autour de 42.306, 9.150'
	);
	await expect(page.locator('.zones li').filter({ hasText: 'Corte' })).toContainText('Orange et plus');

	// A country, from its page.
	await page.goto('/country/fr');
	await page.getByRole('link', { name: 'Surveiller ce pays dans mon compte' }).click();
	await expect(page.getByLabel('Nom de la zone')).toHaveValue('France');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	await expect(page.locator('.zones li').filter({ hasText: 'Pays : France' })).toBeVisible();

	// A drawn zone: clicks on the map, framed on Corte. A zone that crosses itself is refused.
	async function draw(points: [number, number][]) {
		await page.goto('/account');
		await page.goto('/account/zones/new#42.306,9.15,25');
		await page.getByRole('button', { name: 'Une zone dessinée' }).click();
		await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
		const canvas = page.locator('.maplibregl-canvas');
		const box = (await canvas.boundingBox())!;
		for (const [x, y] of points) await canvas.click({ position: { x: box.width * x, y: box.height * y } });
		await expect(page.getByText(`${points.length} coin(s)`)).toBeVisible();
	}
	await draw([
		[0.3, 0.3],
		[0.7, 0.7],
		[0.7, 0.3],
		[0.3, 0.7]
	]);
	await page.getByLabel('Nom de la zone').fill('Croisée');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	await expect(page.getByText('La zone dessinée se croise elle-même')).toBeVisible();

	await draw([
		[0.3, 0.3],
		[0.7, 0.3],
		[0.5, 0.7]
	]);
	await page.getByLabel('Nom de la zone').fill('Triangle');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	const triangle = page.locator('.zones li').filter({ hasText: 'Triangle' });
	await expect(triangle).toContainText('Zone dessinée, 3 coins');
	await triangle.getByRole('link', { name: 'Voir' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Triangle' })).toBeVisible();

	// The circle is a real surface: about π × 25² km².
	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [circle] = await sql`
			select ST_Area(z.geom) / 1e6 as km2 from zones z join users u on u.id = z.user_id
			where u.name = ${name} and z.kind = 'circle'`;
		expect(Number(circle.km2)).toBeGreaterThan(Math.PI * 625 * 0.98);
		expect(Number(circle.km2)).toBeLessThan(Math.PI * 625 * 1.02);

		const exported = await (await page.request.get('/account/export.json')).json();
		expect(exported.zones.map((z: { name: string }) => z.name).sort()).toEqual([
			'Corte',
			'France',
			'Triangle'
		]);

		await page.goto('/account');
		await page
			.locator('.zones li')
			.filter({ hasText: 'France' })
			.getByRole('button', { name: 'Supprimer' })
			.click();
		await expect(page.getByText('Zone supprimée.')).toBeVisible();
		await expect(page.locator('.zones li')).toHaveCount(2);

		// Deleting the account deletes its zones.
		const [user] = await sql`select id from users where name = ${name}`;
		await page.getByLabel('Je veux supprimer mon compte').check();
		await page.getByRole('button', { name: 'Supprimer le compte' }).click();
		await expect(page).toHaveURL(/\/login\?deleted=1$/);
		const [{ n }] = await sql`select count(*)::int as n from zones where user_id = ${user.id}`;
		expect(n).toBe(0);
	} finally {
		await sql.end();
	}
});

// MapLibre held back until the drawn zone is chosen, as on a slow phone: the map still opens on the place of the
// address, and a zone drawn there is not refused as too large. The site's service worker serves its own files
// from its cache, out of reach of page.route: it is blocked here. The page asks for MapLibre once it is running
// (its buttons answer); its load event may wait for the held stylesheet, so it is not waited for.
test.describe(() => {
	test.use({ serviceWorkers: 'block' });
	test('zones: a drawn zone chosen before the map has loaded is drawn on the place of the address', async ({
		page
	}) => {
		await authenticator(page);
		await createAccount(page, unique('Noa'));
		const MAPLIBRE_CSS = '**/maplibre-gl.*.css';
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route(MAPLIBRE_CSS, (route) => held.then(() => route.fallback()));
		const asked = page.waitForRequest(MAPLIBRE_CSS);
		await page.goto('/account/zones/new#42.306,9.15,25', { waitUntil: 'commit' });
		await asked;
		await page.getByRole('button', { name: 'Une zone dessinée' }).click();
		await expect(page.getByRole('button', { name: 'Une zone dessinée' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		release();
		await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
		const canvas = page.locator('.maplibregl-canvas');
		const box = (await canvas.boundingBox())!;
		for (const [x, y] of [
			[0.3, 0.3],
			[0.7, 0.3],
			[0.5, 0.7]
		])
			await canvas.click({ position: { x: box.width * x, y: box.height * y } });
		await expect(page.getByText('3 coin(s)')).toBeVisible();
		await page.getByLabel('Nom de la zone').fill('Triangle');
		await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
		await expect(page.locator('.zones li').filter({ hasText: 'Triangle' })).toContainText(
			'Zone dessinée, 3 coins'
		);
	});
});

test('a place of the account keeps its profile, and near me offers it once signed in', async ({
	page,
	request
}) => {
	await authenticator(page);
	const name = unique('Noa');
	await createAccount(page, name);

	// From near me with a profile: the new zone takes it.
	await page.goto('/near#43.483,-1.559,50,surf');
	await page.getByRole('link', { name: 'Surveiller cet endroit (50 km) dans mon compte' }).click();
	await expect(page).toHaveURL(/\/account\/zones\/new#43\.483,-1\.559,50,surf$/);
	await expect(page.getByLabel(/^Profil, pour l’ordre des cartes/)).toHaveValue('surf');
	await page.getByLabel('Nom de la zone').fill('Côte');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	await expect(page).toHaveURL(/\/account#zones$/);
	const zone = page.locator('.zones li').filter({ hasText: 'Côte' });
	await expect(zone).toContainText('profil Surf');
	await expect(zone.getByRole('link', { name: 'Voir' })).toHaveAttribute(
		'href',
		'/near#43.483,-1.559,50,surf'
	);

	// Near me lists it under the account; a new profile chosen there is kept in the account.
	await page.goto('/near');
	const places = page.getByRole('navigation', { name: 'Mes lieux' });
	await expect(places.getByText('Mon compte')).toBeVisible();
	await places.getByRole('link', { name: 'Côte' }).click();
	await expect(page).toHaveURL(/#43\.483,-1\.559,50,surf$/);
	await expect(page.getByRole('heading', { level: 2, name: 'Côte' })).toBeVisible();
	await expect(page.getByText(/Ce lieu est une zone de votre compte/)).toBeVisible();
	await expect(page.getByRole('link', { name: /Surveiller cet endroit/ })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Suivre ce lieu' })).toHaveCount(0);
	const saved = page.waitForResponse(
		(r) => r.url().endsWith('/account/places.json') && r.request().method() === 'POST'
	);
	await page.getByLabel('Profil').selectOption('sky');
	expect((await saved).status()).toBe(200);
	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [row] = await sql`
			select z.profile from zones z join users u on u.id = z.user_id where u.name = ${name}`;
		expect(row.profile).toBe('sky');
	} finally {
		await sql.end();
	}

	// The answer is private; without a session it is an empty list, not an error.
	const mine = await page.request.get('/account/places.json');
	expect(mine.headers()['cache-control']).toBe('private, no-store');
	expect((await mine.json()).places).toMatchObject([{ name: 'Côte', radiusKm: 50, profile: 'sky' }]);
	const anonymous = await request.get(`${SITE}/account/places.json`);
	expect(anonymous.status()).toBe(200);
	expect(await anonymous.json()).toEqual({ signedIn: false, places: [] });
	expect(
		(await request.post(`${SITE}/account/places.json`, { data: { id: 'x', profile: null } })).status()
	).toBe(401);
});

/** A device as a browser would give it to the site, its push service being e2e/mock-push.mjs. */
function device(label: string) {
	const ecdh = createECDH('prime256v1');
	ecdh.generateKeys();
	const auth = randomBytes(16).toString('base64url');
	const endpoint = `${PUSH}/push/${label}-${randomBytes(4).toString('hex')}`;
	return {
		ecdh,
		auth,
		endpoint,
		subscription: { endpoint, keys: { p256dh: ecdh.getPublicKey('base64url'), auth } }
	};
}

type Received = { path: string; headers: Record<string, string>; body: string };

async function received(page: Page, endpoint: string): Promise<Received[]> {
	const all = (await (await page.request.get(`${PUSH}/received`)).json()) as Received[];
	return all.filter((r) => `${PUSH}${r.path}` === endpoint);
}

function decrypt(dev: ReturnType<typeof device>, r: Received) {
	const plain = ece.decrypt(Buffer.from(r.body, 'base64'), {
		version: 'aes128gcm',
		privateKey: dev.ecdh,
		authSecret: dev.auth
	});
	return JSON.parse(plain.toString('utf-8')) as { title: string; body: string; url: string; tag: string };
}

test('notifications: a device, a test, the alerts of a zone, quiet hours, history', async ({ page }) => {
	await authenticator(page);
	const name = unique('Noa');
	await createAccount(page, name);
	const push = (body: unknown, origin = SITE) =>
		page.request.post('/account/push', { data: body, headers: { origin, ...PROXY } });

	// A zone: France, red only (one red warning in the recorded answers).
	await page.goto('/country/fr');
	await page.getByRole('link', { name: 'Surveiller ce pays dans mon compte' }).click();
	await page.getByLabel('Niveau le plus bas').selectOption('RED');
	await page.getByRole('button', { name: 'Enregistrer la zone' }).click();
	await expect(page.locator('.zones li').filter({ hasText: 'Pays : France' })).toBeVisible();

	// Only the site's own pages, and only a known push service (or the test's).
	expect((await push({ action: 'status', endpoint: PUSH }, 'https://elsewhere.example')).status()).toBe(403);
	const stranger = device('x');
	stranger.subscription.endpoint = 'https://example.com/push/1';
	expect((await push({ action: 'subscribe', subscription: stranger.subscription })).status()).toBe(400);

	// A device: listed by its service only, and a test notification reaches it, encrypted for it.
	const phone = device('phone');
	const subscribed = await push({
		action: 'subscribe',
		subscription: phone.subscription,
		timeZone: 'Europe/Paris'
	});
	expect(subscribed.ok()).toBe(true);
	await page.goto('/account');
	await expect(page.locator('#notifications .keys li')).toHaveCount(1);
	await expect(page.locator('#notifications .keys li')).toContainText('Par 127.0.0.1, ajouté le');
	expect(await (await push({ action: 'test', endpoint: phone.endpoint })).json()).toEqual({
		sent: 1,
		failed: 0
	});
	const [first] = await received(page, phone.endpoint);
	expect(first.headers.ttl).toBe('86400');
	expect(first.headers.urgency).toBe('high');
	expect(first.headers['content-encoding']).toBe('aes128gcm');
	expect(first.headers.authorization).toMatch(/^vapid t=.+, k=.+/);
	expect(decrypt(phone, first)).toEqual({
		title: 'Vigie · notification d’essai',
		body: 'Les alertes de vos zones arriveront comme celle-ci.',
		url: '/account',
		tag: 'test'
	});

	// A device that unsubscribed (410) is forgotten.
	const old = device('gone');
	await push({ action: 'subscribe', subscription: old.subscription });
	expect(await (await push({ action: 'test', endpoint: old.endpoint })).json()).toEqual({
		sent: 0,
		failed: 1
	});

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		const devices = await sql`select endpoint from push_subscriptions where user_id = ${user.id}`;
		expect(devices.map((d) => d.endpoint)).toEqual([phone.endpoint]);

		// The first comparison of the zone is its baseline: what is in force is kept, not sent.
		const baselineDone = async () =>
			(await sql`select baseline_done from zones where user_id = ${user.id}`)[0]?.baseline_done;
		await expect.poll(baselineDone, { timeout: 20_000 }).toBe(true);
		const baseline = await sql`select outcome, level from zone_alerts where user_id = ${user.id}`;
		expect(baseline.length).toBeGreaterThan(0);
		expect(baseline.every((a) => a.outcome === 'baseline' && a.level === 'RED')).toBe(true);
		expect(await received(page, phone.endpoint)).toHaveLength(1);
		await page.goto('/account');
		await expect(page.locator('.history li').first()).toContainText('déjà en cours à la création de la zone');

		// An alert the zone was not told about yet (here, by forgetting the baseline) is sent once.
		await sql`delete from zone_alerts where user_id = ${user.id}`;
		const count = async () => (await received(page, phone.endpoint)).length;
		await expect.poll(count, { timeout: 20_000 }).toBe(1 + baseline.length);
		const alert = decrypt(phone, (await received(page, phone.endpoint))[1]);
		expect(alert.title).toMatch(/^Rouge · /);
		expect(alert.body).toBe('Zone : France');
		expect(alert.url).toMatch(/^\//);
		const outcomes = async () =>
			(await sql`select outcome from zone_alerts where user_id = ${user.id}`).map((a) => a.outcome);
		await expect.poll(outcomes).toEqual(baseline.map(() => 'sent'));
		await page.goto('/account');
		await expect(page.locator('.history li').first()).toContainText('envoyée');

		// Not twice: the next runs find nothing new.
		await page.waitForTimeout(6_000);
		expect(await count()).toBe(1 + baseline.length);

		// Quiet hours, then the export, then removing the device.
		await page.getByLabel('Heures calmes : de 22 h à 7 h, seulement les alertes rouges').check();
		await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
		await expect(page.getByText('Enregistré.')).toBeVisible();
		const [settings] = await sql`select quiet_hours, time_zone from users where id = ${user.id}`;
		expect({ ...settings }).toEqual({ quiet_hours: true, time_zone: 'Europe/Paris' });

		const exported = await (await page.request.get('/account/export.json')).json();
		expect(exported.notification_devices).toHaveLength(1);
		expect(exported.zone_alerts).toHaveLength(baseline.length);

		// The history forgets an alert after 30 days, but not one still in force: it would be told again.
		await sql`update zone_alerts set matched_at = now() - interval '40 days' where user_id = ${user.id}`;
		await sql`
			insert into zone_alerts (user_id, zone_id, alert_key, kind, level, title, url, outcome, matched_at)
			select user_id, zone_id, 'w:FR:ended', kind, level, title, url, outcome, matched_at
			from zone_alerts where user_id = ${user.id} limit 1`;
		const keys = async () =>
			(await sql`select alert_key from zone_alerts where user_id = ${user.id}`).map((a) => a.alert_key);
		await expect.poll(async () => (await keys()).includes('w:FR:ended'), { timeout: 20_000 }).toBe(false);
		expect(await keys()).toHaveLength(baseline.length);
		expect(await count()).toBe(1 + baseline.length);

		await page.locator('#notifications .keys li').getByRole('button', { name: 'Retirer' }).click();
		await expect(page.getByText('Aucun appareil pour l’instant.')).toBeVisible();
	} finally {
		await sql.end();
	}
});

test('the Android app: a device by its token, a test through FCM, forgotten when gone', async ({ page }) => {
	await authenticator(page);
	const name = unique('Lou');
	await createAccount(page, name);
	const push = (body: unknown) =>
		page.request.post('/account/push', { data: body, headers: { origin: SITE, ...PROXY } });
	const token = `e2e:APA91b${randomBytes(48).toString('base64url')}`;

	expect((await push({ action: 'register', token: 'not a token' })).status()).toBe(400);
	expect((await push({ action: 'register', token, timeZone: 'Europe/Paris' })).ok()).toBe(true);
	expect(await (await push({ action: 'status', token })).json()).toEqual({ id: expect.any(String) });
	await page.goto('/account');
	await expect(page.locator('#notifications .keys li')).toContainText('Appli Android, ajoutée le');

	// The test notification goes to FCM: shown by Android, its page in data, on the channel of the other alerts.
	expect(await (await push({ action: 'test', token })).json()).toEqual({ sent: 1, failed: 0 });
	const all = (await (await page.request.get(`${PUSH}/received`)).json()) as Received[];
	const mine = all.filter((r) => r.path === `/fcm/${token}`);
	expect(mine).toHaveLength(1);
	expect(mine[0].headers.authorization).toBe('Bearer mock-access-token');
	const { message } = JSON.parse(Buffer.from(mine[0].body, 'base64').toString('utf-8'));
	expect(message).toEqual({
		token,
		notification: {
			title: 'Vigie · notification d’essai',
			body: 'Les alertes de vos zones arriveront comme celle-ci.'
		},
		data: { url: '/account', tag: 'test' },
		android: {
			ttl: '86400s',
			priority: 'HIGH',
			collapse_key: 'test',
			notification: { tag: 'test', channel_id: 'vigie-alerts' }
		}
	});

	// A token FCM no longer knows (404, UNREGISTERED) is forgotten; the other device stays.
	const old = `gone:APA91b${randomBytes(48).toString('base64url')}`;
	await push({ action: 'register', token: old });
	expect(await (await push({ action: 'test', token: old })).json()).toEqual({ sent: 0, failed: 1 });
	expect(await (await push({ action: 'status', token: old })).json()).toEqual({ id: null });

	const exported = await (await page.request.get('/account/export.json')).json();
	expect(exported.notification_devices.map((d: { fcm_token: string }) => d.fcm_token)).toEqual([token]);

	expect((await push({ action: 'unsubscribe', token })).ok()).toBe(true);
	await page.goto('/account');
	await expect(page.getByText('Aucun appareil pour l’instant.')).toBeVisible();
});
