import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The rain radar of Météo-France on the map (`GET /v1/radar/france` of the API, e2e/fixtures/radar-france.json, recorded on
// 2026-11-18): a card over the map, on France only, with the last 35 minutes. The mock API draws every tile with one recorded tile.
const frames = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'radar-france.json'), 'utf-8'))
	.frames as { epoch: number }[];
const nowcastFrames = JSON.parse(
	readFileSync(join(import.meta.dirname, 'fixtures', 'radar-france-nowcast.json'), 'utf-8')
).frames as { epoch: number; lead_minutes: number }[];
const kept = frames.slice(-8).map((f) => f.epoch);
const totalTimeline = kept.length + nowcastFrames.length;
const newest = kept[kept.length - 1];
const paris = (epoch: number) =>
	new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(
		new Date(epoch * 1000)
	);

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		// The warnings of a country that was not recorded: 502, expected when the map moves over it (e2e/site.spec.ts).
		if (m.type() === 'error' && !m.location().url.includes('/data/warnings/')) errors.push(m.text());
	});
	return errors;
}

const card = (page: Page) => page.getByTestId('radar-card');
const view = async (page: Page, name: string) => {
	await page.getByRole('button', { name, exact: true }).click();
};
const open = async (page: Page, path = '/') => {
	await page.goto(path);
	await expect(page.locator('.wrap[data-ready]')).toBeVisible({ timeout: 15_000 });
};

test('the radar card is on France only: not on the world, there on France, gone over the Pacific', async ({
	page
}) => {
	await open(page);
	await expect(card(page)).toHaveCount(0);

	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });
	await expect(card(page)).toContainText(`Radar de pluie · ${paris(newest)}`);

	await view(page, 'Pacifique ouest');
	await expect(card(page)).toHaveCount(0);
	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });
});

test('the card has a button, a slider over the last 35 minutes, a legend, and says it is measured', async ({
	page
}) => {
	const errors = collectErrors(page);
	await open(page);
	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });

	const slider = card(page).getByRole('slider');
	await expect(slider).toHaveAttribute('max', String(totalTimeline - 1));
	await expect(slider).toHaveValue(String(kept.length - 1));
	await expect(card(page).getByTestId('radar-phase')).toContainText('Observé');
	await expect(card(page).getByTestId('radar-phase')).toContainText('Prévision PIAF +1 h');
	await expect(card(page).getByRole('button', { name: 'Lecture' })).toBeVisible();
	// The legend is a picture for the eye and a sentence for the others, from 0,1 to 64 mm/h.
	const legend = card(page).getByRole('img', { name: /Intensité de la pluie en millimètres par heure/ });
	await expect(legend).toHaveAttribute('aria-label', /≥ 0,1, .*≥ 64$/);
	await expect(card(page)).toContainText('mm/h');
	await expect(card(page)).toContainText('Mesuré par radar, pas une prévision.');
	// The credit: in the map's attribution and in the credits of the page.
	await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Source : Météo-France');
	await expect(page.getByText(/Source: Météo-France, mosaïque radar/)).toBeVisible();

	// The slider chooses an image: its time is the title of the card, and sliding into PIAF switches badge & note.
	await slider.fill('0');
	await expect(card(page)).toContainText(`Radar de pluie · ${paris(kept[0])}`);
	await slider.fill(String(kept.length));
	await expect(card(page)).toContainText(`Prévision PIAF (+5 min) · ${paris(nowcastFrames[0].epoch)}`);
	await expect(card(page)).toContainText('Prévision immédiate PIAF (Météo-France), pas une mesure radar.');
	await slider.fill(String(kept.length - 1));
	await expect(card(page)).toContainText(`Radar de pluie · ${paris(newest)}`);
	expect(errors.filter((e) => !/WebGL|webgl/.test(e))).toEqual([]);
});

test('Play goes through the images, and a whole animation asks for a few hundred tiles at most', async ({
	page
}) => {
	const asked: string[] = [];
	page.on('request', (r) => {
		if (/\/data\/radar\/france\/(?:\d+|nowcast\/tiles\/\d+)\/.*\.png$/.test(r.url())) asked.push(r.url());
	});
	await open(page);
	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });
	const slider = card(page).getByRole('slider');
	await expect.poll(() => asked.length).toBeGreaterThan(0);

	// From the newest observed image, Play starts from the oldest and advances through observed and PIAF frames.
	await card(page).getByRole('button', { name: 'Lecture' }).click();
	await expect(card(page).getByRole('button', { name: 'Pause' })).toBeVisible();
	const seen = new Set<string>();
	await expect
		.poll(
			async () => {
				seen.add(await slider.inputValue());
				return seen.size;
			},
			{ timeout: 20_000, intervals: [100] }
		)
		.toBeGreaterThanOrEqual(kept.length);
	await card(page).getByRole('button', { name: 'Pause' }).click();
	await expect(card(page).getByRole('button', { name: 'Lecture' })).toBeVisible();

	// Every frame (observed + PIAF) is preloaded on Play without exceeding reasonable tile volume.
	console.log(`radar: one animation = ${asked.length} tile requests`);
	expect(asked.length).toBeGreaterThanOrEqual(totalTimeline);
	expect(asked.length).toBeLessThan(650);
	const epochsAsked = new Set(
		asked.map((u) => {
			const m = /\/(?:france|tiles)\/(\d+)\//.exec(u);
			return m?.[1] ?? '';
		})
	);
	expect(epochsAsked.size).toBe(totalTimeline);
});

test('the card folds into a button, and the page asks the list of images once', async ({ page }) => {
	let lists = 0;
	page.on('request', (r) => {
		if (new URL(r.url()).pathname === '/data/radar.json') lists++;
	});
	await open(page);
	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });
	await card(page).getByRole('button', { name: 'Masquer le radar de pluie' }).click();
	await expect(card(page)).toHaveCount(0);
	await page.getByRole('button', { name: 'Afficher le radar de pluie' }).click();
	await expect(card(page)).toBeVisible();
	await view(page, 'Europe');
	await view(page, 'France');
	await expect(card(page)).toBeVisible();
	expect(lists).toBe(1);
});

test('the card speaks English and stays inside the map', async ({ page }) => {
	await open(page, '/?lang=en');
	await view(page, 'France');
	await expect(card(page)).toBeVisible({ timeout: 15_000 });
	await expect(card(page).getByRole('button', { name: 'Play' })).toBeVisible();
	await expect(card(page)).toContainText('Measured by radar, not a forecast.');
	await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Radar: Météo-France');
	const map = await page.locator('.mapwrap').boundingBox();
	const box = await card(page).boundingBox();
	expect(box!.x).toBeGreaterThanOrEqual(map!.x);
	expect(box!.x + box!.width).toBeLessThanOrEqual(map!.x + map!.width);
	expect(box!.y).toBeGreaterThanOrEqual(map!.y);
	expect(box!.y + box!.height).toBeLessThanOrEqual(map!.y + map!.height);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the site relays the images and their tiles, and checks what it is asked', async ({ request }) => {
	const list = await request.get('/data/radar.json');
	expect(list.status()).toBe(200);
	expect(list.headers()['cache-control']).toMatch(/public, max-age=\d+/);
	const body = await list.json();
	expect(body.frames).toEqual(kept);
	expect(body.legend).toHaveLength(9);
	expect(body.minZoom).toBe(3);

	const tile = await request.get(`/data/radar/${newest}/6/32/22.png`);
	expect(tile.status()).toBe(200);
	expect(tile.headers()['content-type']).toBe('image/png');
	expect(tile.headers()['cache-control']).toContain('immutable');
	expect((await tile.body()).subarray(1, 4).toString()).toBe('PNG');

	// An image the API does not list, a tile outside the pyramid, and words instead of numbers.
	expect((await request.get(`/data/radar/1000/6/32/22.png`)).status()).toBe(404);
	expect((await request.get(`/data/radar/${newest}/6/64/22.png`)).status()).toBe(404);
	expect((await request.get(`/data/radar/${newest}/13/0/0.png`)).status()).toBe(404);
	expect((await request.get(`/data/radar/${newest}/6/a/22.png`)).status()).toBe(404);
	// The oldest image of the API's list, older than the 35 minutes kept, is not relayed either.
	expect((await request.get(`/data/radar/${frames[0].epoch}/6/32/22.png`)).status()).toBe(404);

	// The overseas areas: their own list (the mock derives it from France's, as the API's was not deployed when this was written) and
	// their own tiles; an area the API does not have is a 404, like a word that is not one.
	const antilles = await request.get('/data/radar.json?area=antilles');
	expect(antilles.status()).toBe(200);
	expect((await antilles.json()).bounds).toEqual([-66, 10.59, -57, 21]);
	const antillesTile = await request.get(`/data/radar/antilles/${newest}/6/20/30.png`);
	expect(antillesTile.status()).toBe(200);
	expect((await antillesTile.body()).subarray(1, 4).toString()).toBe('PNG');
	expect((await request.get(`/data/radar/france/${newest}/6/32/22.png`)).status()).toBe(200);
	for (const bad of ['guyane', 'toString', 'FRANCE'])
		expect((await request.get(`/data/radar.json?area=${bad}`)).status()).toBe(404);
	expect((await request.get(`/data/radar/guyane/${newest}/6/32/22.png`)).status()).toBe(404);
});
