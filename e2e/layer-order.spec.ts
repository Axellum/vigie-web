import { expect, test, type Page } from '@playwright/test';
import { closeLayers, openLayers } from './layers';

// The order of the map's layers, from the bottom: the base map, the warnings, the rain radar (under the names of the base map),
// the forecast wind's trails, then the badges of the measured wind on top. The map is read through `window.vigieMap`, set only
// in a browser driven by tests (MapView.svelte).

const open = async (page: Page) => {
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
};

/** The ids of the map's layers, from the bottom, and the place of the first label of the base map (none while a new style loads). */
const layers = (page: Page) =>
	page.evaluate(() => {
		const map = (
			window as unknown as {
				vigieMap?: { getStyle(): { layers: { id: string; type: string }[] } | undefined };
			}
		).vigieMap!;
		const all = map.getStyle()?.layers ?? [];
		return { ids: all.map((l) => l.id), firstLabel: all.findIndex((l) => l.type === 'symbol') };
	});

const WARNINGS = [
	'zone-fill',
	'zone-outline',
	'zone-river',
	'quake',
	'fc-cone',
	'fc-cone-edge',
	'fc-warning',
	'fc-track',
	'fc-point'
];

async function expectOrder(page: Page, radarLayers: number) {
	const { ids, firstLabel } = await layers(page);
	const at = (id: string) => {
		expect(ids, id).toContain(id);
		return ids.indexOf(id);
	};
	const radar = ids.flatMap((id, i) => (id.startsWith('radar-') ? [i] : []));
	expect(radar.length).toBeGreaterThanOrEqual(radarLayers);
	const warnings = WARNINGS.map(at);
	// The base map, then the warnings (the aurora and the eclipse under them), the rain, the names of the base map.
	expect(Math.max(at('aurora-fill'), at('eclipse-line'))).toBeLessThan(Math.min(...warnings));
	expect(Math.max(...warnings)).toBeLessThan(Math.min(...radar));
	expect(Math.max(...radar)).toBeLessThan(firstLabel);
	// What the visitor picked and the site's own points stay over the rain.
	for (const id of ['zone-selected', 'quake-selected', 'place-dot', 'fc-label', 'spot-dot'])
		expect(at(id), id).toBeGreaterThan(firstLabel);
}

test('warnings under the rain, the forecast wind over both, the measured wind on top', async ({ page }) => {
	// Twenty radar frames, two rain layers and a second map style: 28 s of the default 30 on the CI's desktop run.
	test.setTimeout(60_000);
	await open(page);
	// The warnings' markers are there on the world.
	await expect(page.locator('.vigie-marker').first()).toBeAttached({ timeout: 15_000 });

	await page.getByRole('button', { name: 'France', exact: true }).click();
	await expect(page.getByTestId('radar-card')).toBeVisible({ timeout: 15_000 });
	await expectOrder(page, 1);

	// Play loads every observed + PIAF frame: the images added later go over the warnings too.
	await page.getByTestId('radar-card').getByRole('button', { name: 'Lecture' }).click();
	await expect
		.poll(async () => (await layers(page)).ids.filter((id) => id.startsWith('radar-')).length)
		.toBe(20);
	await expectOrder(page, 20);

	// Global observed satellite precipitation layer sits above warnings, below radar and below base map labels.
	// The rain's layers are ticked in their family, opened from the rail of the map.
	await openLayers(page, 'Pluie');
	await page.getByTestId('observed-rain-toggle').check();
	await expect
		.poll(async () => (await layers(page)).ids.includes('observed-rain'), { timeout: 15_000 })
		.toBe(true);
	{
		const { ids, firstLabel } = await layers(page);
		const obs = ids.indexOf('observed-rain');
		const maxWarn = Math.max(...WARNINGS.map((id) => ids.indexOf(id)));
		const minRadar = Math.min(...ids.flatMap((id, i) => (id.startsWith('radar-') ? [i] : [])));
		expect(obs).toBeGreaterThan(maxWarn);
		expect(obs).toBeLessThan(minRadar);
		expect(obs).toBeLessThan(firstLabel);
	}
	await page.getByTestId('observed-rain-toggle').uncheck();

	// Global forecast rain layers (one per level drawn) sit above warnings, below radar and below base map labels.
	await page.getByTestId('rain-field-toggle').check();
	await expect
		.poll(async () => (await layers(page)).ids.some((id) => id.startsWith('rain-field-')), {
			timeout: 15_000
		})
		.toBe(true);
	{
		const { ids, firstLabel } = await layers(page);
		const rf = ids.flatMap((id, i) => (id.startsWith('rain-field-') ? [i] : []));
		const maxWarn = Math.max(...WARNINGS.map((id) => ids.indexOf(id)));
		const minRadar = Math.min(...ids.flatMap((id, i) => (id.startsWith('radar-') ? [i] : [])));
		expect(Math.min(...rf)).toBeGreaterThan(maxWarn);
		expect(Math.max(...rf)).toBeLessThan(minRadar);
		expect(Math.max(...rf)).toBeLessThan(firstLabel);
	}
	await page.getByTestId('rain-field-toggle').uncheck();

	// The dark theme builds the map again (another base map), the radar already there: the same order.
	const light = (await layers(page)).ids.join();
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect
		.poll(async () => {
			const now = await layers(page);
			return (
				now.ids.join() !== light &&
				now.ids.includes('fc-label') &&
				now.ids.some((id) => id.startsWith('radar-'))
			);
		})
		.toBe(true);
	await expectOrder(page, 1);

	// Over the map's canvas: the warnings' markers, then the trails, then the badges and their card.
	await openLayers(page, 'Vent');
	await page.getByTestId('flow-toggle').check();
	await page.getByTestId('wind-toggle').check();
	await expect(page.getByTestId('wind-flow')).toBeAttached({ timeout: 15_000 });
	await expect.poll(() => page.getByTestId('wind-badge').count(), { timeout: 15_000 }).toBeGreaterThan(10);
	await closeLayers(page);
	const z = (selector: string) =>
		page.evaluate((s) => {
			const el = document.querySelector(s);
			return el ? Number(getComputedStyle(el).zIndex) || 0 : null;
		}, selector);
	const marker = await z('.vigie-marker');
	const trails = await z('canvas.vigie-flow');
	const badge = await z('[data-testid="wind-badge"]');
	expect(marker).not.toBeNull();
	expect(marker!).toBeLessThan(trails!);
	expect(trails!).toBeLessThan(badge!);
	// They all lie in the map's own container, which keeps MapLibre's buttons and the cards over them.
	expect(
		await page.evaluate(() => {
			const box = document.querySelector('.maplibregl-canvas-container')!;
			return ['.vigie-marker', 'canvas.vigie-flow', '[data-testid="wind-badge"]'].every(
				(s) => document.querySelector(s)?.parentElement === box
			);
		})
	).toBe(true);
	// On a phone the radar card covers the bottom of the map, and which badge comes first depends on the data: click the first
	// badge that nothing covers, as a visitor would (a trial click scrolls to it and checks that it would get the click).
	const badges = page.getByTestId('wind-badge');
	let free = -1;
	for (let i = 0, n = await badges.count(); i < n && free < 0; i++) {
		const clickable = await badges
			.nth(i)
			.click({ trial: true, timeout: 1_000 })
			.then(
				() => true,
				() => false
			);
		if (clickable) free = i;
	}
	expect(free).toBeGreaterThanOrEqual(0);
	await badges.nth(free).click();
	await expect(page.locator('.vigie-wind-popup')).toBeVisible();
	expect(await z('.vigie-wind-popup')).toBeGreaterThan(badge!);
});

test('the tint of a warning fades up close, so that the map stays readable inside a warned area', async ({
	page
}) => {
	await open(page);
	// The opacity MapLibre draws the warnings' tint with at a zoom (a constant of the zoom, not of the zone).
	const opacityAt = (zoom: number) =>
		page.evaluate(
			(z) =>
				new Promise<number | undefined>((ok) => {
					const map = (
						window as unknown as {
							vigieMap?: {
								jumpTo(o: object): void;
								once(event: string, f: () => void): void;
								getLayer(
									id: string
								):
									| { paint?: { get(name: string): { constantOr(v: undefined): number | undefined } } }
									| undefined;
							};
						}
					).vigieMap!;
					map.once('idle', () =>
						ok(map.getLayer('zone-fill')?.paint?.get('fill-opacity').constantOr(undefined))
					);
					map.jumpTo({ center: [2.35, 46.6], zoom: z });
				}),
			zoom
		);
	expect(await opacityAt(6)).toBeCloseTo(0.4);
	expect(await opacityAt(10)).toBeCloseTo(0.26);
	expect(await opacityAt(14)).toBeCloseTo(0.12);
});
