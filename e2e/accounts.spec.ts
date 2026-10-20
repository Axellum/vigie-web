import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Accounts: invitation, passkey, sign-in, export, deletion. The passkeys are made by Chromium's virtual
// authenticator; the invitations by the script the owner uses (scripts/invite.mjs), on the test database.
const SITE = 'http://localhost:4174';
const DATABASE_URL = 'postgres://postgres@127.0.0.1:15433/postgres';

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

const unique = (prefix: string) => `${prefix} ${randomBytes(3).toString('hex')}`;

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

	const exported = await (await page.request.get('/account/export.json')).json();
	expect(exported.account.name).toBe(name);
	expect(exported.passkeys).toHaveLength(1);
	expect(JSON.stringify(exported)).not.toContain('public_key');

	const sql = postgres(DATABASE_URL, { max: 1 });
	try {
		const [user] = await sql`select id from users where name = ${name}`;
		expect(user).toBeTruthy();

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
				(select count(*) from sessions where user_id = ${user.id})::int as sessions`;
		expect(left[0]).toEqual({ users: 0, passkeys: 0, sessions: 0 });
	} finally {
		await sql.end();
	}

	// The passkey still on the device no longer opens anything.
	await page.getByRole('button', { name: 'Se connecter avec une passkey' }).click();
	await expect(page.getByText('Cette passkey n’est pas connue du site')).toBeVisible();
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
