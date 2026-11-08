import { expect, test, type Page } from '@playwright/test';

// The page that sets a television screen up (/screens): choices in, the address of the screen out. The places are the ones of the mock
// API (51 surf spots); the screen that the address opens is the one of /tv, whose data are the recorded ones of the spot `tv-hossegor`.
const SPOT = 'soorts-hossegor-plage-sud-point-d-or';

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

test.skip(
	({ isMobile }) => isMobile,
	'a television is set up from a computer: the desktop project runs these'
);

test('with no place chosen the page asks for one and writes no address', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/screens');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Un écran de météo et de mer pour une télévision'
	);
	await expect(page.locator('#spot option')).toHaveCount(52); // the 51 places, and the invitation to choose one
	await expect(page.locator('#result')).toContainText('Choisissez un lieu pour voir l’adresse.');
	await expect(page.locator('#screen-address')).toHaveCount(0);
	// The site is around the page: this is a page to read, not a screen.
	await expect(page.locator('nav[aria-label="Vigie"]')).toBeVisible();
	expect(errors).toEqual([]);
});

test('the address follows the choices, and the screen it opens is set as it was asked', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/screens');
	await page.locator('#spot').selectOption(SPOT);
	// A short address: only the place and the language, since everything else is the default.
	const address = page.locator('#screen-address');
	await expect(address).toHaveValue(new RegExp(`/tv\\?spot=${SPOT}&lang=fr$`));
	await expect(page.locator('a:has-text("Ouvrir l’écran")')).toHaveAttribute(
		'href',
		`/tv?spot=${SPOT}&lang=fr`
	);

	await page.getByLabel('Club de sports nautiques').check();
	await page.locator('#panels').selectOption('verdicts');
	await page.getByLabel('Toujours la nuit').check();
	await page.getByLabel('English').check();
	await expect(address).toHaveValue(
		new RegExp(`/tv\\?spot=${SPOT}&preset=club&panels=verdicts&theme=night&lang=en$`)
	);
	// The choices live in the address of the page: they survive a reload and can be sent to someone.
	await page.reload();
	await expect(page.locator('#spot')).toHaveValue(SPOT);
	await expect(page.getByLabel('Club de sports nautiques')).toBeChecked();
	await expect(page.locator('#panels')).toHaveValue('verdicts');

	// What the television does with the address: the same query, on a place that has recorded data.
	const href = await page.locator('a:has-text("Ouvrir l’écran")').getAttribute('href');
	const query = new URLSearchParams((href ?? '').split('?')[1]);
	query.set('spot', 'tv-hossegor');
	await page.goto(`/tv?${query.toString()}`);
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'screen');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-lang', 'en');
	await expect(page.locator('#tv-root')).toHaveClass(/tv-night/);
	await expect(page.locator('.tv-panel.tv-on')).toHaveAttribute('data-panel', 'verdicts');
	await expect(page.locator('#tv-dots')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('a place the API does not know makes no address, and a typo in the other values is a default', async ({
	page
}) => {
	await page.goto('/screens?spot=no-such-place&preset=nonsense&d=0&panels=x');
	await expect(page.locator('#spot')).toHaveValue('');
	await expect(page.locator('#screen-address')).toHaveCount(0);
	await page.goto(`/screens?spot=${SPOT}&preset=nonsense&d=abc&panels=x&theme=x`);
	await expect(page.locator('#screen-address')).toHaveValue(new RegExp(`/tv\\?spot=${SPOT}&lang=fr$`));
});

test('the page speaks English, takes that language for the screen, and the footer and the sitemap lead to it', async ({
	page,
	request
}) => {
	await page.goto(`/screens?lang=en&spot=${SPOT}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'A weather and sea screen for a television'
	);
	await expect(page.locator('#screen-address')).toHaveValue(new RegExp(`&lang=en$`));
	await expect(page.locator('footer a[href="/screens"]')).toHaveText('TV screens');
	const xml = await (await request.get('/sitemap.xml')).text();
	expect(xml).toContain('/screens</loc>');
});

test('the screen that lists the places leads to the page that sets a screen up', async ({ page }) => {
	await page.goto('/tv');
	await expect(page.locator('#tv-root')).toHaveAttribute('data-state', 'choose');
	await expect(page.locator('a.tv-link')).toHaveAttribute('href', '/screens');
});
