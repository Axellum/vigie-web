import { expect, test, type Page } from '@playwright/test';

// The widget page (/widget), which a desktop app shows in a panel a few hundred pixels wide: a place after the `#`, a surf spot in
// the query. The data are the recorded ones of the mock API: the weather of a point in Corsica, the warnings of France, the
// television spot of Hossegor.
const PLACE = '#42.306,9.149/Corte';
const SIZES = { small: [300, 98], medium: [300, 256], large: [300, 572] } as const;

test.skip(
	({ isMobile }) => isMobile,
	'a widget has its own size: the desktop project is the one that runs these'
);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	return errors;
}

/** What the widget holds below its own height: a widget cannot scroll. */
const overflow = (page: Page) =>
	page.locator('.widget').evaluate((w) => Math.max(0, w.scrollHeight - w.clientHeight));

test('a place: its sky, its warnings and its rain, and the exact position never leaves the browser', async ({
	page
}) => {
	const errors = collectErrors(page);
	const asked: string[] = [];
	page.on('request', (r) => asked.push(r.url()));
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto(`/widget?size=medium${PLACE}`);
	await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
	await expect(page.getByText('Corte')).toBeVisible();
	await expect(page.getByText('17°')).toBeVisible();
	// The recorded weather is weeks old: the rain of the hour is not told from it.
	await expect(page.getByText('Pluie de l’heure non lue')).toBeVisible();
	await expect(page.getByText(/Vigilance|vigilance/).first()).toBeVisible();
	await expect(page.getByText('Vigilances…')).toHaveCount(0);
	expect(await overflow(page)).toBe(0);
	// Only the cell of the grid goes to the server, for the weather and the measured wind.
	expect(asked.some((u) => u.includes('/data/point.json?lat=42.3&lon=9.15'))).toBe(true);
	expect(asked.filter((u) => u.includes('42.306') || u.includes('9.149'))).toEqual([]);
	expect(errors).toEqual([]);
});

test('a surf spot: the verdicts of its activities and its tide', async ({ page }) => {
	const errors = collectErrors(page);
	await page.setViewportSize({ width: SIZES.medium[0], height: SIZES.medium[1] });
	await page.goto('/widget?size=medium&theme=light&spot=tv-hossegor');
	await expect(page.getByText(/Bon|Possible|Déconseillé/).first()).toBeVisible();
	await expect(page.getByText('Règles de Vigie, pas pour la sécurité')).toBeVisible();
	expect(await overflow(page)).toBe(0);
	expect(errors).toEqual([]);
});

for (const [size, [width, height]] of Object.entries(SIZES)) {
	for (const theme of ['sky', 'dark', 'light']) {
		test(`the ${size} widget in the ${theme} theme holds in its frame`, async ({ page }) => {
			const errors = collectErrors(page);
			await page.setViewportSize({ width, height });
			await page.goto(`/widget?size=${size}&theme=${theme}&spot=tv-hossegor${PLACE}`);
			await expect(page.locator('.widget')).toHaveAttribute('data-ready', 'yes');
			await expect(page.getByText('Corte').first()).toBeVisible();
			await expect(page.getByText('Vigilances…')).toHaveCount(0);
			expect(await overflow(page)).toBe(0);
			expect(errors).toEqual([]);
		});
	}
}

test('without a place nor a spot, the widget says what to do', async ({ page }) => {
	await page.setViewportSize({ width: SIZES.small[0], height: SIZES.small[1] });
	await page.goto('/widget?size=small');
	await expect(page.getByText('Aucun lieu choisi')).toBeVisible();
	await page.goto('/widget?size=small&spot=nowhere-at-all');
	await expect(page.getByText('Spot inconnu')).toBeVisible();
});
