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
