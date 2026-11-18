import { expect, test, type Page } from '@playwright/test';

// The ensemble forecast of Météo-France (PE-AROME) in the detail of the weather card: bars of the chance of 1 mm of rain for each
// window of three hours of the next 24 hours, and chips from 10 %. The recorded answer (e2e/fixtures/point.json, a point in France,
// run of 03:00 UTC) has eight windows; the mock gives none outside France, like the API.
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const noOverflow = async (page: Page) =>
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
	).toBeLessThanOrEqual(0);

for (const width of [375, 1280]) {
	test(`France: eight bars, the chips from 10 % and the legend, at ${width} px`, async ({ page }) => {
		const errors = collectErrors(page);
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/near#42.306,9.15,300');
		const weather = page.getByRole('region', { name: 'Météo', exact: true });
		await weather.getByText('Détail').click();
		const ens = weather.getByRole('region', { name: 'Pluie probable, 24 prochaines heures' });
		await expect(ens).toBeVisible({ timeout: 15_000 });

		// One bar per window, each read aloud with its end hour at the place (UTC+2 in the recorded answer) and its chance.
		const bars = ens.getByRole('list', { name: /^Chance d.au moins 1 mm de pluie par tranche de 3 heures/ });
		await expect(bars.getByRole('listitem')).toHaveCount(8);
		await expect(bars.getByRole('listitem').first()).toContainText("Jusqu'à 17 h : 95 %");
		await expect(bars.getByRole('listitem').last()).toContainText("Jusqu'à 14 h : 82 %");
		// The value is written above each bar, readable without the colour.
		await expect(bars.getByRole('listitem').first().locator('.ens-value')).toHaveText('95');

		// The chips: the rain of 5 mm at its highest window, the gusts until the last window at 10 % or more, the storm; the hail
		// (7 % at most) and the snow (0 %) are below 10 % and absent.
		await expect(ens.getByText('Pluie ≥ 5 mm : 51 % vers 17 h')).toBeVisible();
		await expect(ens.getByText("Rafales > 56 km/h : 95 % jusqu'à 14 h")).toBeVisible();
		await expect(ens.getByText('Orage : 11 %')).toBeVisible();
		await expect(ens.getByText(/Grêle/)).toHaveCount(0);
		// From 50 % a chip is stressed with the accent of the site, never with a colour of the official warnings (yellow, orange, red).
		await expect(ens.locator('.ens-chip.strong').first()).toContainText('Rafales');
		const colours = await page.evaluate(() => {
			const resolve = (v: string) => {
				const e = document.createElement('i');
				e.style.color = v;
				document.body.append(e);
				const c = getComputedStyle(e).color;
				e.remove();
				return c;
			};
			const css = getComputedStyle(document.documentElement);
			const chip = document.querySelector('.ens-chip.strong') as Element;
			const s = getComputedStyle(chip);
			return {
				border: s.borderTopColor,
				ring: s.boxShadow,
				accent: resolve(css.getPropertyValue('--accent')),
				sev: ['yellow', 'orange', 'red'].map((k) => resolve(css.getPropertyValue('--sev-' + k)))
			};
		});
		expect(colours.border).toBe(colours.accent);
		for (const c of colours.sev) {
			expect(c).not.toBe('');
			expect(colours.border).not.toBe(c);
			expect(colours.ring).not.toContain(c);
		}
		await expect(ens.getByText(/Neige/)).toHaveCount(0);

		// Said plainly: a chance for the area, not for one spot, a model forecast; the credit with the run.
		await expect(ens.getByText(/pas pour un point précis/)).toBeVisible();
		await expect(ens.getByText(/Météo-France \(Licence Ouverte 2\.0\), run de 03\sh\sUTC/)).toBeVisible();
		await expect(ens.getByText(/alerte/i)).toHaveCount(0);

		// The daily table of Open-Meteo (the "Risque" column) stays where it was.
		await expect(weather.getByRole('columnheader', { name: /Risque/ }).first()).toBeAttached();
		await noOverflow(page);
		expect(errors).toEqual([]);
	});
}

test('English, and nothing at all outside France', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/near?lang=en#42.306,9.15,300');
	const weather = page.getByRole('region', { name: 'Weather', exact: true });
	await weather.getByText('Detail').click();
	const ens = weather.getByRole('region', { name: 'Chance of rain, next 24 hours' });
	await expect(ens).toBeVisible({ timeout: 15_000 });
	await expect(ens.getByText('Rain ≥ 5 mm: 51% around 17:00')).toBeVisible();
	await expect(ens.getByText('Gusts > 56 km/h: 95% until 14:00')).toBeVisible();
	await expect(ens.getByText(/not for one exact spot/)).toBeVisible();

	// São Paulo: the API gives no probabilities, so the card has no such block (and no hole where it was).
	await page.goto('/near?lang=en#-23.55,-46.63,300');
	const there = page.getByRole('region', { name: 'Weather', exact: true });
	await there.getByText('Detail').click();
	await expect(there.getByText('Next days')).toBeVisible({ timeout: 15_000 });
	await expect(page.getByRole('region', { name: 'Chance of rain, next 24 hours' })).toHaveCount(0);
	expect(errors).toEqual([]);
});
