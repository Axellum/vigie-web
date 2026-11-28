import { expect, test, type Page } from '@playwright/test';
import { IGN_TERRITORIES } from '../src/lib/ign';
import { openLayers } from './layers';

// The IGN's layers of France on the home map (src/lib/ign.ts), the "Carte" family: the relief (shading and LiDAR HD, on by
// default; the contour lines when ticked), the aerial photo (when ticked) and the details of the BD TOPO (foreshores,
// beaches, ski lifts; on by default, from zoom 15). Each in its place among the layers of the base map, asked of the IGN
// only inside the territories, and the choices kept. The IGN is not reached: its tiles are answered here, as it answers over
// the sea (404, an empty tile for MapLibre).

const IGN = 'https://data.geopf.fr/**';
const IGN_PREFIX = /^(photo|relief|details)-/;

/** The layers of the map, from the bottom. */
const layers = (page: Page) =>
	page.evaluate(() => {
		const map = (
			window as unknown as {
				vigieMap?: { getStyle(): { layers: { id: string; type: string }[] } | undefined };
			}
		).vigieMap!;
		return (map.getStyle()?.layers ?? []).map((l) => ({ id: l.id, type: l.type }));
	});

/** The base map's layers of buildings and whether each is shown. */
const buildings = (page: Page) =>
	page.evaluate(() => {
		const map = (
			window as unknown as {
				vigieMap?: {
					getStyle(): { layers: { id: string; 'source-layer'?: string }[] } | undefined;
					getLayoutProperty(id: string, name: string): unknown;
				};
			}
		).vigieMap!;
		return (map.getStyle()?.layers ?? [])
			.filter((l) => l['source-layer'] === 'building')
			.map((l) => ({ id: l.id, visibility: map.getLayoutProperty(l.id, 'visibility') }));
	});

/** How much the photo of mainland France is dimmed (its `raster-brightness-max`), or null when it is not drawn. */
const photoDimmed = (page: Page) =>
	page.evaluate(() => {
		const map = (
			window as unknown as {
				vigieMap?: { getLayer(id: string): unknown; getPaintProperty(id: string, name: string): unknown };
			}
		).vigieMap!;
		return map.getLayer('photo-fr')
			? (map.getPaintProperty('photo-fr', 'raster-brightness-max') ?? null)
			: null;
	});

/** The ids of the layers of one IGN layer, and where they lie against the base map's first line or label. */
async function placeOf(page: Page, prefix: string) {
	const all = await layers(page);
	const at = all.flatMap((l, i) => (l.id.startsWith(prefix) ? [i] : []));
	return {
		ids: all.filter((l) => l.id.startsWith(prefix)).map((l) => l.id),
		first: Math.min(Infinity, ...at),
		last: Math.max(-1, ...at),
		firstLine: all.findIndex((l) => (l.type === 'line' || l.type === 'symbol') && !IGN_PREFIX.test(l.id)),
		index: (id: string) => all.findIndex((l) => l.id === id)
	};
}

/** Whether the tile of a TMS address (z/x/y, y from the top as MapLibre asks it) touches one of the territories' boxes. */
function inATerritory(url: string): boolean {
	const m = /\/(\d+)\/(\d+)\/(\d+)\.(png|jpeg|pbf)$/.exec(url);
	if (!m) return false;
	const [z, x, y] = m.slice(1, 4).map(Number);
	const n = 2 ** z;
	const lon = (i: number) => (i / n) * 360 - 180;
	const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
	const [west, east, north, south] = [lon(x), lon(x + 1), lat(y), lat(y + 1)];
	return IGN_TERRITORIES.some(
		({ box: [w, s, e, nb] }) => west <= e && east >= w && south <= nb && north >= s
	);
}

/** The address of a tile of an IGN layer. */
const tile = (layer: string, ext = 'png') =>
	new RegExp(
		`^https://data\\.geopf\\.fr/tms/1\\.0\\.0/${layer.replace(/\./g, '\\.')}/\\d+/\\d+/\\d+\\.${ext}$`
	);

const MONT_BLANC: [number, number] = [6.87, 45.85];
const SAINT_MALO: [number, number] = [-2.03, 48.648];

const jumpTo = (page: Page, center: [number, number], zoom: number) =>
	page.evaluate(
		([c, z]) =>
			(window as unknown as { vigieMap?: { jumpTo(o: object): void } }).vigieMap!.jumpTo({
				center: c,
				zoom: z
			}),
		[center, zoom] as const
	);

/** Answers the IGN's tiles here and keeps their addresses. */
async function answerIgn(page: Page) {
	const asked: string[] = [];
	await page.route(IGN, (route) => {
		asked.push(route.request().url());
		return route.fulfill({ status: 404 });
	});
	return asked;
}

test('the relief of France is on at first, under the lines of the base map, and asked of the IGN only up close', async ({
	page
}) => {
	const asked = await answerIgn(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await expect
		.poll(async () => (await placeOf(page, 'relief-')).ids.length, { timeout: 15_000 })
		.toBeGreaterThan(0);
	const { ids, last, firstLine } = await placeOf(page, 'relief-');
	// The shading and the LiDAR HD of each territory, no contour lines unless ticked.
	expect(ids.filter((id) => id.startsWith('relief-shade-'))).toContain('relief-shade-fr');
	expect(ids.filter((id) => id.startsWith('relief-lidar-'))).toContain('relief-lidar-fr');
	expect(ids.some((id) => id.startsWith('relief-contour-'))).toBe(false);
	expect(last).toBeLessThan(firstLine);
	// The map goes as close as zoom 16, where the details of the BD TOPO are seen.
	expect(
		await page.evaluate(() =>
			(window as unknown as { vigieMap?: { getMaxZoom(): number } }).vigieMap!.getMaxZoom()
		)
	).toBe(16);
	// The world: too far for the shading, nothing is asked.
	expect(asked).toEqual([]);

	// The Mont-Blanc massif at zoom 12: the shading and the LiDAR HD, from the IGN's tile service; not yet the details.
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
	expect(asked.some((url) => url.includes('/BDTOPO/'))).toBe(false);
	// Every tile asked touches one of the territories' boxes: the map never asks the IGN for a tile outside them.
	for (const url of asked) expect(inATerritory(url), url).toBe(true);
	await expect(page.getByText('Relief © IGN').first()).toBeAttached();
});

test('the "Carte" family adds the contour lines and turns the relief off, and the choice is kept', async ({
	page
}) => {
	const asked = await answerIgn(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	const relief = page.getByTestId('relief-toggle');
	const contours = page.getByTestId('contours-toggle');
	await expect(relief).toBeChecked();
	await expect(contours).not.toBeChecked();

	await contours.check();
	await expect
		.poll(async () => (await placeOf(page, 'relief-')).ids.some((id) => id.startsWith('relief-contour-')))
		.toBe(true);
	{
		const { last, firstLine } = await placeOf(page, 'relief-');
		expect(last).toBeLessThan(firstLine);
	}
	// They are drawn from zoom 13.
	await jumpTo(page, MONT_BLANC, 12);
	await expect
		.poll(
			() => asked.some((url) => tile('IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW').test(url)),
			{
				timeout: 15_000
			}
		)
		.toBe(true);
	expect(asked.some((url) => tile('ELEVATION.CONTOUR.LINE').test(url))).toBe(false);
	await jumpTo(page, MONT_BLANC, 13);
	await expect
		.poll(() => asked.some((url) => tile('ELEVATION.CONTOUR.LINE').test(url)), { timeout: 15_000 })
		.toBe(true);

	await relief.uncheck();
	await expect.poll(async () => (await placeOf(page, 'relief-')).ids).toEqual([]);
	await expect(contours).toBeDisabled();
	await expect(page.getByText('Relief © IGN')).toHaveCount(0);

	// Kept in the browser: off again after a reload.
	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	await expect(page.getByTestId('relief-toggle')).not.toBeChecked();
	expect((await placeOf(page, 'relief-')).ids).toEqual([]);
});

test('the aerial photo, when ticked, lies under the relief with the water of the base map over it', async ({
	page
}) => {
	const asked = await answerIgn(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	const photo = page.getByTestId('photo-toggle');
	await expect(photo).not.toBeChecked();
	expect((await placeOf(page, 'photo-')).ids).toEqual([]);

	await photo.check();
	await expect.poll(async () => (await placeOf(page, 'photo-')).ids).toContain('photo-fr');
	const place = await placeOf(page, 'photo-');
	// The photo of each territory, then the base map's water drawn again over it; all under the relief.
	expect(place.ids).toContain('photo-water-water');
	expect(place.index('photo-water-water')).toBeGreaterThan(place.index('photo-fr'));
	expect(place.last).toBeLessThan(place.index('relief-shade-fr'));
	expect(place.last).toBeLessThan(place.firstLine);
	await expect(page.getByText('Photo © IGN').first()).toBeAttached();
	// The base map's buildings would hide the roofs: hidden while the photo is on.
	const shown = await buildings(page);
	expect(shown.length).toBeGreaterThan(0);
	expect(shown.every((b) => b.visibility === 'none')).toBe(true);

	await jumpTo(page, MONT_BLANC, 12);
	await expect
		.poll(() => asked.some((url) => tile('ORTHOIMAGERY.ORTHOPHOTOS', 'jpeg').test(url)), { timeout: 15_000 })
		.toBe(true);
	for (const url of asked) expect(inATerritory(url), url).toBe(true);

	// The dark theme draws a new base map: the photo comes back on it, dimmed, and its buildings are hidden again.
	await page.emulateMedia({ colorScheme: 'dark' });
	await expect.poll(() => photoDimmed(page), { timeout: 15_000 }).toBe(0.85);
	{
		const dark = await buildings(page);
		expect(dark.length).toBeGreaterThan(0);
		expect(dark.every((b) => b.visibility === 'none')).toBe(true);
	}

	// Kept in the browser: on again after a reload, and off when unticked.
	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	await expect(page.getByTestId('photo-toggle')).toBeChecked();
	await expect.poll(async () => (await placeOf(page, 'photo-')).ids).toContain('photo-fr');
	await page.getByTestId('photo-toggle').uncheck();
	await expect.poll(async () => (await placeOf(page, 'photo-')).ids).toEqual([]);
	await expect(page.getByText('Photo © IGN')).toHaveCount(0);
	expect((await buildings(page)).every((b) => b.visibility !== 'none')).toBe(true);
});

test('the foreshores, beaches and ski lifts are on at first and asked of the IGN from zoom 15 only', async ({
	page
}) => {
	const asked = await answerIgn(page);
	await page.goto('/');
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await expect.poll(async () => (await placeOf(page, 'details-')).ids).toContain('details-fr-beach');
	const place = await placeOf(page, 'details-');
	// The foreshores and the cables over the relief, under the roads; the beaches and the names over the base map's names,
	// under the site's own layers.
	expect(place.index('details-fr-foreshore')).toBeGreaterThan(place.index('relief-lidar-fr'));
	expect(place.index('details-fr-lift')).toBeLessThan(place.firstLine);
	const labels = (await layers(page)).findIndex((l) => l.type === 'symbol' && !IGN_PREFIX.test(l.id));
	expect(place.index('details-fr-beach')).toBeGreaterThan(labels);
	expect(place.index('details-fr-lift-name')).toBeLessThan(place.index('zone-selected'));
	await expect(page.getByText('BD TOPO © IGN').first()).toBeAttached();

	// Zoom 12: the relief only.
	await jumpTo(page, SAINT_MALO, 12);
	await expect
		.poll(() => asked.some((url) => tile('ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW').test(url)), {
			timeout: 15_000
		})
		.toBe(true);
	expect(asked.some((url) => url.includes('/BDTOPO/'))).toBe(false);
	// Zoom 15: the BD TOPO's vector tiles.
	await jumpTo(page, SAINT_MALO, 15);
	await expect
		.poll(() => asked.some((url) => tile('BDTOPO', 'pbf').test(url)), { timeout: 15_000 })
		.toBe(true);
	for (const url of asked) expect(inATerritory(url), url).toBe(true);

	await openLayers(page, 'Carte');
	await page.getByTestId('details-toggle').uncheck();
	await expect.poll(async () => (await placeOf(page, 'details-')).ids).toEqual([]);
	await expect(page.getByText('BD TOPO © IGN')).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
	await openLayers(page, 'Carte');
	await expect(page.getByTestId('details-toggle')).not.toBeChecked();
});
