import { expect, test, type Page } from '@playwright/test';
import { RELIEF_TERRITORIES } from '../src/lib/relief';
import { openLayers } from './layers';

// The relief of France (src/lib/relief.ts): the IGN's shading and LiDAR HD, on by default, under the lines and the names of
// the base map; the contour lines when ticked; all of it turned off in the "Carte" family, and the choice kept. The IGN is
// not reached: its tiles are answered here, as it answers over the sea (404, an empty tile for MapLibre).

const IGN = 'https://data.geopf.fr/**';

/** The relief's layers, from the bottom, and the place of the base map's first line or label. */
const reliefLayers = (page: Page) =>
	page.evaluate(() => {
		const map = (
			window as unknown as {
				vigieMap?: { getStyle(): { layers: { id: string; type: string }[] } | undefined };
			}
		).vigieMap!;
		const all = map.getStyle()?.layers ?? [];
		const ids = all.map((l) => l.id);
		return {
			ids: ids.filter((id) => id.startsWith('relief-')),
			last: Math.max(-1, ...ids.flatMap((id, i) => (id.startsWith('relief-') ? [i] : []))),
			firstLine: all.findIndex(
				(l) => (l.type === 'line' || l.type === 'symbol') && !l.id.startsWith('relief-')
			)
		};
	});

/** Whether the tile of a TMS address (z/x/y, y from the top as MapLibre asks it) touches one of the relief's boxes. */
function inATerritory(url: string): boolean {
	const m = /\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
	if (!m) return false;
	const [z, x, y] = m.slice(1).map(Number);
	const n = 2 ** z;
	const lon = (i: number) => (i / n) * 360 - 180;
	const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
	const [west, east, north, south] = [lon(x), lon(x + 1), lat(y), lat(y + 1)];
	return RELIEF_TERRITORIES.some(
		({ box: [w, s, e, nb] }) => west <= e && east >= w && south <= nb && north >= s
	);
}

/** The address of a tile of an IGN layer. */
const tile = (layer: string) =>
	new RegExp(`^https://data\\.geopf\\.fr/tms/1\\.0\\.0/${layer.replace(/\./g, '\\.')}/\\d+/\\d+/\\d+\\.png$`);

const MONT_BLANC: [number, number] = [6.87, 45.85];

const jumpTo = (page: Page, center: [number, number], zoom: number) =>
	page.evaluate(
		([c, z]) =>
			(window as unknown as { vigieMap?: { jumpTo(o: object): void } }).vigieMap!.jumpTo({
				center: c,
				zoom: z
			}),
		[center, zoom] as const
	);

test('the relief of France is on at first, under the lines of the base map, and asked of the IGN only up close', async ({
	page
}) => {
	const asked: string[] = [];
	await page.route(IGN, (route) => {
		asked.push(route.request().url());
		return route.fulfill({ status: 404 });
	});
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await expect
		.poll(async () => (await reliefLayers(page)).ids.length, { timeout: 15_000 })
		.toBeGreaterThan(0);
	const { ids, last, firstLine } = await reliefLayers(page);
	// The shading and the LiDAR HD of each territory, no contour lines unless ticked.
	expect(ids.filter((id) => id.startsWith('relief-shade-'))).toContain('relief-shade-fr');
	expect(ids.filter((id) => id.startsWith('relief-lidar-'))).toContain('relief-lidar-fr');
	expect(ids.some((id) => id.startsWith('relief-contour-'))).toBe(false);
	expect(last).toBeLessThan(firstLine);
	// The world: too far for the shading, nothing is asked.
	expect(asked).toEqual([]);

	// The Mont-Blanc massif, as close as the map goes: the shading and the LiDAR HD, from the IGN's tile service.
	await jumpTo(page, MONT_BLANC, 12);
	await expect
		.poll(() => asked.some((url) => tile('ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW').test(url)), {
			timeout: 15_000
		})
		.toBe(true);
	await expect
		.poll(() =>
			asked.some((url) => tile('IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW').test(url))
		)
		.toBe(true);
	// Every tile asked touches one of the territories' boxes: the map never asks the IGN for a tile outside them.
	for (const url of asked) expect(inATerritory(url), url).toBe(true);
	await expect(page.getByText('Relief © IGN').first()).toBeAttached();
});

test('the "Carte" family adds the contour lines and turns the relief off, and the choice is kept', async ({
	page
}) => {
	const asked: string[] = [];
	await page.route(IGN, (route) => {
		asked.push(route.request().url());
		return route.fulfill({ status: 404 });
	});
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	const relief = page.getByTestId('relief-toggle');
	const contours = page.getByTestId('contours-toggle');
	await expect(relief).toBeChecked();
	await expect(contours).not.toBeChecked();

	await contours.check();
	await expect
		.poll(async () => (await reliefLayers(page)).ids.some((id) => id.startsWith('relief-contour-')))
		.toBe(true);
	{
		const { last, firstLine } = await reliefLayers(page);
		expect(last).toBeLessThan(firstLine);
	}
	// They are drawn when the map is as close as it goes (zoom 12): a threshold past it would leave the box without effect.
	await jumpTo(page, MONT_BLANC, 12);
	await expect
		.poll(() => asked.some((url) => tile('ELEVATION.CONTOUR.LINE').test(url)), { timeout: 15_000 })
		.toBe(true);

	await relief.uncheck();
	await expect.poll(async () => (await reliefLayers(page)).ids).toEqual([]);
	await expect(contours).toBeDisabled();
	await expect(page.getByText('Relief © IGN')).toHaveCount(0);

	// Kept in the browser: off again after a reload.
	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	await expect(page.getByTestId('relief-toggle')).not.toBeChecked();
	expect((await reliefLayers(page)).ids).toEqual([]);
});
