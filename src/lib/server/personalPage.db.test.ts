// The data of "My page" against a real schema: every migration applied to PostgreSQL with PostGIS (PGlite, in memory,
// reached through the PostgreSQL protocol like the site does), then the limits the database keeps whatever the code
// does, the server modules, what a deletion takes with it, and the way back (migrations/down).
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_PLACES } from '../myPlaces';
import { MAX_BLOCKS, MAX_PAGES } from '../pageConfig';
import {
	appendStarterBlocks,
	createPage,
	ensureFirstPage,
	getPage,
	listPages,
	PageError,
	removePage,
	savePage
} from './pages';
import {
	createLink,
	forgetSharedPages,
	LinkError,
	listLinks,
	MAX_LINKS,
	readSharedPage,
	revokeLink
} from './pageLinks';
import { addPlace, listPlaces, PlaceError, removePlace, setHome, updatePlace } from './savedPlaces';
import { prefsFromForm, readPrefs, savePrefs } from './userPrefs';
import { addZone, listZones } from './zones';

const MIGRATIONS = join(import.meta.dirname, 'migrations');
const files = readdirSync(MIGRATIONS)
	.filter((f) => f.endsWith('.sql'))
	.sort();
const read = (...p: string[]) => readFileSync(join(MIGRATIONS, ...p), 'utf-8');

let pg: PGlite;
let server: PGLiteSocketServer;
let sql: postgres.Sql;

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.once('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as { port: number };
			probe.close(() => resolve(port));
		});
	});
}

async function user(name: string): Promise<string> {
	const [row] = await sql<{ id: string }[]>`
		insert into users (id, name) values (gen_random_uuid(), ${name}) returning id`;
	return row.id;
}

const spot = { name: 'Plage', lat: 43.666, lon: -1.445, radiusKm: 25, profile: null };
const rejects = (promise: Promise<unknown>) => expect(promise).rejects.toThrow();

beforeAll(async () => {
	pg = await PGlite.create({ extensions: { postgis } });
	const port = await freePort();
	server = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 4 });
	await server.start();
	sql = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
	await sql.unsafe(
		'create table schema_migrations (id text primary key, applied_at timestamptz default now())'
	);
	for (const f of files) {
		await sql.unsafe(read(f));
		await sql.unsafe('insert into schema_migrations (id) values ($1)', [f.replace(/\.sql$/, '')]);
	}
}, 120_000);

afterAll(async () => {
	await sql?.end({ timeout: 2 });
	await server?.stop();
	await pg?.close();
});

describe('the migrations', () => {
	it('are all registered in the loader, in order', () => {
		const loader = readFileSync(join(import.meta.dirname, 'db.ts'), 'utf-8');
		const registered = [...loader.matchAll(/id: '(\d{3}_[a-z_]+)'/g)].map((m) => m[1]);
		expect(registered).toEqual(files.map((f) => f.replace(/\.sql$/, '')));
	});

	it('have a way back for the latest one, kept out of the loader', () => {
		const loader = readFileSync(join(import.meta.dirname, 'db.ts'), 'utf-8');
		expect(loader).not.toContain('down/');
		expect(readdirSync(join(MIGRATIONS, 'down'))).toContain('006_personal_page.down.sql');
	});
});

describe('the limits the database keeps', () => {
	it('stores the home to about 1 km at most, never public, one per account', async () => {
		const u = await user('limits-home');
		const home = (extra = '', lat = 43.66, public_ = false) =>
			sql.unsafe(
				`insert into places (id, user_id, name, kind, lat, lon, public ${extra})
				values (gen_random_uuid(), $1, 'Home', 'home', $2, 1.44, $3 ${extra ? ', 1' : ''})`,
				[u, lat, public_]
			);
		await rejects(home('', 43.66, true)); // a public home
		await rejects(home('', 43.661)); // finer than two decimals
		await home();
		await rejects(home()); // a second home
	});

	it('bounds the radius, the point and the name of a place', async () => {
		const u = await user('limits-place');
		const add = (radius: number, lat: number, name = 'A') =>
			sql.unsafe(
				'insert into places (id, user_id, name, lat, lon, radius_km) values (gen_random_uuid(), $1, $2, $3, 0, $4)',
				[u, name, lat, radius]
			);
		await add(25, 10);
		await rejects(add(0, 10));
		await rejects(add(1001, 10));
		await rejects(add(25, 91));
		await rejects(add(25, 10, ''));
		await rejects(add(25, 10, 'x'.repeat(61)));
	});

	it('bounds a page, its address, and the preferences', async () => {
		const u = await user('limits-page');
		const page = (blocks: unknown, slug: string | null = null) =>
			sql.unsafe(
				'insert into pages (id, user_id, title, blocks, public_slug) values (gen_random_uuid(), $1, $2, $3::text::jsonb, $4)',
				[u, 'Ma page', JSON.stringify(blocks), slug]
			);
		await page([]);
		await rejects(page({ a: 1 }));
		await rejects(page(Array.from({ length: 25 }, () => ({}))));
		await rejects(page([{ pad: 'x'.repeat(9000) }]));
		await page([], 'ma-page-1');
		await rejects(page([], 'ma-page-1')); // an address is one page's
		await rejects(page([], 'UPPER'));
		await rejects(page([], 'a'));
		await rejects(sql.unsafe("update users set prefs = '[]' where id = $1", [u]));
		await sql.unsafe(`update users set prefs = '{"units":{"wind":"kn"}}' where id = $1`, [u]);
	});
});

describe('the places and pages of an account', () => {
	it('keeps at most MAX_PLACES places besides the home', async () => {
		const u = await user('places');
		for (let i = 0; i < MAX_PLACES; i++) await addPlace(sql, u, { ...spot, name: `P${i}` });
		await expect(addPlace(sql, u, spot)).rejects.toMatchObject({ code: 'full' });
		await setHome(sql, u, { ...spot, name: 'Home', lat: 43.66612, lon: -1.44478 });
		const list = await listPlaces(sql, u);
		expect(list).toHaveLength(MAX_PLACES + 1);
		expect(list[0]).toMatchObject({ kind: 'home', lat: 43.67, lon: -1.44, public: false });
		expect(list[1].name).toBe('P0');
	});

	it('moves the same home when it is set again, so that its blocks stay on the pages', async () => {
		const u = await user('home-moves');
		const first = await setHome(sql, u, { ...spot, name: 'Home', lat: 43.66, lon: 1.44 });
		const page = await createPage(sql, u, 'Ma page');
		await savePage(sql, u, page, 'Ma page', [{ id: 'aaaa', type: 'weather', place: first, size: 'm' }]);
		const second = await setHome(sql, u, { ...spot, name: 'New home', lat: 48.8566, lon: 2.3522 });
		expect(second).toBe(first);
		const [home] = await listPlaces(sql, u);
		expect(home).toMatchObject({ name: 'New home', lat: 48.86, lon: 2.35 });
		expect((await getPage(sql, u, page))?.blocks).toHaveLength(1);
	});

	it('rounds a point itself when it is changed, the home to 1 km and a place to 100 m', async () => {
		const u = await user('rounds');
		const home = await setHome(sql, u, { ...spot, name: 'Home', lat: 1, lon: 1 });
		const place = await addPlace(sql, u, spot);
		await updatePlace(sql, u, home, { ...spot, name: 'Home', lat: 43.66612, lon: -1.44478 });
		await updatePlace(sql, u, place, { ...spot, lat: 43.66612, lon: -1.44478 });
		const list = await listPlaces(sql, u);
		expect(list.find((p) => p.id === home)).toMatchObject({ lat: 43.67, lon: -1.44 });
		expect(list.find((p) => p.id === place)).toMatchObject({ lat: 43.666, lon: -1.445 });
	});

	it('never lets an account touch the places or pages of another', async () => {
		const a = await user('mine');
		const b = await user('theirs');
		const placeB = await addPlace(sql, b, spot);
		const pageB = await createPage(sql, b, 'Their page');
		await expect(updatePlace(sql, a, placeB, spot)).rejects.toBeInstanceOf(PlaceError);
		await expect(removePlace(sql, a, placeB)).rejects.toBeInstanceOf(PlaceError);
		await expect(removePlace(sql, a, 'not-an-id')).rejects.toBeInstanceOf(PlaceError);
		await expect(removePage(sql, a, pageB)).rejects.toBeInstanceOf(PageError);
		expect(await getPage(sql, a, pageB)).toBeNull();
		const pageA = await createPage(sql, a, 'My page');
		await expect(
			savePage(sql, a, pageA, 'My page', [{ id: 'aaaa', type: 'weather', place: placeB, size: 's' }])
		).rejects.toMatchObject({ code: 'place' });
		await expect(savePage(sql, a, pageB, 'Hijacked', [])).rejects.toMatchObject({ code: 'unknown' });
		expect((await getPage(sql, b, pageB))?.title).toBe('Their page');
	});

	it('takes the blocks of a removed place off the pages, and keeps the others in order', async () => {
		const u = await user('strip');
		const [a, b, c] = [
			await addPlace(sql, u, spot),
			await addPlace(sql, u, spot),
			await addPlace(sql, u, spot)
		];
		const one = await createPage(sql, u, 'One');
		const two = await createPage(sql, u, 'Two');
		const blocks = [
			{ id: 'aaaa', type: 'weather', place: a, size: 's' },
			{ id: 'bbbb', type: 'tide', place: b, size: 'm' },
			{ id: 'cccc', type: 'sky', place: c, size: 'l' },
			{ id: 'dddd', type: 'air', place: b, size: 's' }
		];
		await savePage(sql, u, one, 'One', blocks);
		await savePage(sql, u, two, 'Two', blocks.slice(0, 1));
		await removePlace(sql, u, b);
		expect((await getPage(sql, u, one))?.blocks.map((x) => x.id)).toEqual(['aaaa', 'cccc']);
		expect((await getPage(sql, u, two))?.blocks.map((x) => x.id)).toEqual(['aaaa']);
		await removePlace(sql, u, a);
		await removePlace(sql, u, c);
		expect((await getPage(sql, u, one))?.blocks).toEqual([]);
	});

	it('keeps at most MAX_PAGES pages', async () => {
		const u = await user('pages');
		for (let i = 0; i < MAX_PAGES; i++) await createPage(sql, u, `Page ${i}`);
		await expect(createPage(sql, u, 'One too many')).rejects.toMatchObject({ code: 'full' });
		expect(await listPages(sql, u)).toHaveLength(MAX_PAGES);
	});
});

describe('the first page of an account', () => {
	const rules = { minLevel: 'YELLOW' as const, kinds: ['VIGILANCE' as const] };
	const circle = (name: string, lat: number, profile: 'surf' | null = null) => ({
		kind: 'circle' as const,
		name,
		lat,
		lon: 1.23456,
		radiusKm: 25,
		profile,
		...rules
	});

	it('offers the circle zones already followed, once, and lays out their first cards', async () => {
		const u = await user('starter');
		const surf = await addZone(sql, u, circle('Plage', 43.66612, 'surf'));
		await addZone(sql, u, circle('Port', 48.1));
		await addZone(sql, u, { kind: 'country', name: 'France', country: 'FR', ...rules, profile: null });
		const page = await ensureFirstPage(sql, u, 'Ma page');
		const places = await listPlaces(sql, u);
		expect(places.map((p) => [p.name, p.lat, p.lon, p.radiusKm, p.profile, p.kind])).toEqual([
			['Plage', 43.666, 1.235, 25, 'surf', 'place'],
			['Port', 48.1, 1.235, 25, null, 'place']
		]);
		expect(places[0].zoneId).toBe(surf);
		expect(page.title).toBe('Ma page');
		expect(page.blocks).toHaveLength(6);
		expect(new Set(page.blocks.map((b) => b.place))).toEqual(new Set(places.map((p) => p.id)));
		// A second opening changes nothing: the same page, the same places, the zones untouched.
		const again = await ensureFirstPage(sql, u, 'Autre titre');
		expect(again.id).toBe(page.id);
		expect(await listPlaces(sql, u)).toHaveLength(2);
		expect(await listPages(sql, u)).toHaveLength(1);
		expect(await listZones(sql, u)).toHaveLength(3);
	});

	it('lays out the first cards of a new place on the first page, once, within the limit of the page', async () => {
		const u = await user('starter-append');
		const page = await ensureFirstPage(sql, u, 'My page');
		const first = await addPlace(sql, u, { ...spot, profile: 'surf' });
		expect(await appendStarterBlocks(sql, u, first)).toBe(3);
		expect((await getPage(sql, u, page.id))?.blocks.map((b) => [b.place, b.size])).toEqual([
			[first, 'm'],
			[first, 'm'],
			[first, 'm']
		]);
		// A place that already has a card on the page, one of another account, or one that does not exist: nothing.
		expect(await appendStarterBlocks(sql, u, first)).toBe(0);
		expect(await appendStarterBlocks(sql, await user('starter-other'), first)).toBe(0);
		expect(await appendStarterBlocks(sql, u, 'not-an-id')).toBe(0);
		// Only as many cards as the page holds: the page fills up, and the next place gets none.
		for (let i = 0; i < 7; i++) {
			await appendStarterBlocks(sql, u, await addPlace(sql, u, { ...spot, name: `Lieu ${i}` }));
		}
		expect((await getPage(sql, u, page.id))?.blocks).toHaveLength(MAX_BLOCKS);
		const late = await addPlace(sql, u, { ...spot, name: 'Trop tard' });
		expect(await appendStarterBlocks(sql, u, late)).toBe(0);
		expect((await getPage(sql, u, page.id))?.blocks).toHaveLength(MAX_BLOCKS);
	});

	it('gives an account with nothing an empty page, and does not copy zones over places it already keeps', async () => {
		const empty = await user('starter-empty');
		const page = await ensureFirstPage(sql, empty, 'My page');
		expect(page.blocks).toEqual([]);
		expect(await listPlaces(sql, empty)).toEqual([]);

		const keeps = await user('starter-keeps');
		await addPlace(sql, keeps, spot);
		await addZone(sql, keeps, circle('Zone', 10));
		const kept = await ensureFirstPage(sql, keeps, 'My page');
		expect((await listPlaces(sql, keeps)).map((p) => p.name)).toEqual(['Plage']);
		expect(kept.blocks).toHaveLength(3);
	});
});

describe('the preferences of an account', () => {
	it('keep the units the site offers and the language, and nothing else', async () => {
		const u = await user('prefs');
		expect(await readPrefs(sql, u)).toEqual({ units: {} });
		const form = new FormData();
		form.set('temperature', 'f');
		form.set('wind', 'kn');
		form.set('height', 'cubit');
		form.set('theme', 'dark');
		await savePrefs(sql, u, prefsFromForm(form), 'en');
		expect(await readPrefs(sql, u)).toEqual({ units: { temperature: 'f', wind: 'kn' } });
		const [row] = await sql`select lang, prefs from users where id = ${u}`;
		expect(row.lang).toBe('en');
		expect(row.prefs).toEqual({ units: { temperature: 'f', wind: 'kn' } });
		// Without a language the language stays; a unit left out is a unit nobody chose.
		await savePrefs(sql, u, prefsFromForm(new FormData()));
		expect(await readPrefs(sql, u)).toEqual({ units: {} });
		expect((await sql`select lang from users where id = ${u}`)[0].lang).toBe('en');
	});
});

describe('the private links of a page', () => {
	/** An account with a home, two places and a page that shows a card of each, the home's included. */
	async function shared(name: string) {
		const u = await user(name);
		const home = await setHome(sql, u, { ...spot, name: 'Chez moi', lat: 48.85, lon: 2.35 });
		const plage = await addPlace(sql, u, { ...spot, name: 'Plage', profile: 'surf' });
		const port = await addPlace(sql, u, { ...spot, name: 'Port', lat: 48.1, lon: -4.3 });
		const page = await createPage(sql, u, 'Mon écran');
		await savePage(sql, u, page, 'Mon écran', [
			{ id: 'aaaa', type: 'weather', place: home, size: 'm' },
			{ id: 'bbbb', type: 'surf', place: plage, size: 'l' },
			{ id: 'cccc', type: 'tide', place: port, size: 's' }
		]);
		return { u, home, plage, port, page };
	}

	it('shows the page to whoever holds the secret, as its owner laid it out, and keeps no secret', async () => {
		forgetSharedPages();
		const { u, page } = await shared('link-owner');
		const token = await createLink(sql, u, page, 'Écran du salon');
		expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
		// What the database holds is the hash, and nothing from which the secret can be read back.
		const rows =
			await sql`select encode(token_hash, 'hex') as id, label from page_links where user_id = ${u}`;
		expect(rows).toHaveLength(1);
		expect(JSON.stringify(rows)).not.toContain(token);
		const list = await listLinks(sql, u, page);
		expect(list).toEqual([
			expect.objectContaining({ id: rows[0].id, label: 'Écran du salon', revoked: false, lastOpenedAt: null })
		]);
		expect(JSON.stringify(list)).not.toContain(token);

		const read = await readSharedPage(sql, token);
		expect(read).toEqual({
			title: 'Mon écran',
			blocks: [
				{
					id: 'bbbb',
					type: 'surf',
					size: 'l',
					place: { name: 'Plage', lat: 43.666, lon: -1.445, radiusKm: 25, profile: 'surf' }
				},
				{
					id: 'cccc',
					type: 'tide',
					size: 's',
					place: { name: 'Port', lat: 48.1, lon: -4.3, radiusKm: 25, profile: null }
				}
			],
			units: { temperature: 'c', wind: 'kmh', height: 'm' },
			lang: 'fr'
		});
		// A screen that opened the link leaves a trace of it.
		expect((await listLinks(sql, u, page))[0].lastOpenedAt).not.toBeNull();
	});

	it('never shows the home, wherever the blocks say it is', async () => {
		forgetSharedPages();
		const { u, home, page } = await shared('link-home');
		const read = await readSharedPage(sql, await createLink(sql, u, page, ''));
		const text = JSON.stringify(read);
		expect(text).not.toContain('Chez moi');
		expect(text).not.toContain('48.85');
		expect(text).not.toContain('2.35');
		expect(read?.blocks.map((b) => b.id)).toEqual(['bbbb', 'cccc']);
		// A page made of the home alone shows nothing: not an error, and not the home.
		const only = await createPage(sql, u, 'Maison seule');
		await savePage(sql, u, only, 'Maison seule', [{ id: 'dddd', type: 'weather', place: home, size: 'm' }]);
		const lonely = await readSharedPage(sql, await createLink(sql, u, only, ''));
		expect(lonely?.blocks).toEqual([]);
	});

	it('follows the units and the language of the account', async () => {
		forgetSharedPages();
		const { u, page } = await shared('link-units');
		await sql`update users set lang = 'en', prefs = ${JSON.stringify({ units: { temperature: 'f', wind: 'kn' } })}::text::jsonb where id = ${u}`;
		const read = await readSharedPage(sql, await createLink(sql, u, page, ''));
		expect(read?.units).toEqual({ temperature: 'f', wind: 'kn', height: 'm' });
		expect(read?.lang).toBe('en');
	});

	it('answers "not found" for a secret badly formed, unknown or revoked, and an error when the database fails', async () => {
		forgetSharedPages();
		const { u, page } = await shared('link-null');
		// Badly formed: no query is made at all.
		const never = (() => {
			throw new Error('the database must not be asked');
		}) as unknown as postgres.Sql;
		expect(await readSharedPage(never, 'short')).toBeNull();
		expect(await readSharedPage(never, 'x'.repeat(31) + '!')).toBeNull();
		expect(await readSharedPage(sql, 'A'.repeat(32))).toBeNull();

		const token = await createLink(sql, u, page, '');
		expect(await readSharedPage(sql, token)).not.toBeNull();
		// Revoked: at once for the server that revoked it, and for a new one.
		await revokeLink(sql, u, (await listLinks(sql, u, page))[0].id);
		expect(await readSharedPage(sql, token)).toBeNull();
		forgetSharedPages();
		expect(await readSharedPage(sql, token)).toBeNull();
		expect((await listLinks(sql, u, page))[0].revoked).toBe(true);

		// A database that does not answer is not "not found": a screen keeps its last value.
		const down = (() => Promise.reject(new Error('database down'))) as unknown as postgres.Sql;
		await expect(readSharedPage(down, 'B'.repeat(32))).rejects.toThrow('database down');
	});

	it('keeps a read for a minute, and reads again after that', async () => {
		forgetSharedPages();
		const { u, page } = await shared('link-cache');
		const token = await createLink(sql, u, page, '');
		const t0 = Date.now();
		expect((await readSharedPage(sql, token, t0))?.title).toBe('Mon écran');
		await sql`update pages set title = 'Autre titre' where id = ${page}`;
		expect((await readSharedPage(sql, token, t0 + 59_000))?.title).toBe('Mon écran');
		expect((await readSharedPage(sql, token, t0 + 61_000))?.title).toBe('Autre titre');
	});

	it('never lets an account list or revoke the links of another, and keeps at most MAX_LINKS', async () => {
		forgetSharedPages();
		const mine = await shared('link-mine');
		const other = await shared('link-other');
		await createLink(sql, mine.u, mine.page, 'à moi');
		const id = (await listLinks(sql, mine.u, mine.page))[0].id;
		expect(await listLinks(sql, other.u, mine.page)).toEqual([]);
		await expect(revokeLink(sql, other.u, id)).rejects.toBeInstanceOf(LinkError);
		await expect(createLink(sql, other.u, mine.page, 'vole')).rejects.toMatchObject({ code: 'unknown' });
		await expect(revokeLink(sql, mine.u, 'not-a-hash')).rejects.toMatchObject({ code: 'unknown' });
		for (let i = 1; i < MAX_LINKS; i++) await createLink(sql, mine.u, mine.page, `écran ${i}`);
		await expect(createLink(sql, mine.u, mine.page, 'de trop')).rejects.toMatchObject({ code: 'full' });
		// A revoked link frees its place.
		await revokeLink(sql, mine.u, id);
		await createLink(sql, mine.u, mine.page, 'de nouveau');
	});

	it('goes with the page', async () => {
		forgetSharedPages();
		const { u, page } = await shared('link-gone');
		const token = await createLink(sql, u, page, '');
		expect(await readSharedPage(sql, token)).not.toBeNull();
		await removePage(sql, u, page);
		forgetSharedPages();
		expect(await readSharedPage(sql, token)).toBeNull();
		expect(await sql`select 1 from page_links where user_id = ${u}`).toHaveLength(0);
	});
});

describe('what a deletion takes with it', () => {
	it('removes the places, pages and links of a deleted account', async () => {
		const u = await user('deleted');
		const other = await user('stays');
		const place = await addPlace(sql, u, spot);
		await addPlace(sql, other, spot);
		const page = await createPage(sql, u, 'Page');
		await sql.unsafe(
			"insert into page_links (token_hash, page_id, user_id, label) values (decode('aa', 'hex'), $1, $2, 'Kitchen')",
			[page, u]
		);
		await sql`delete from users where id = ${u}`;
		const [left] = await sql<{ places: number; pages: number; links: number; others: number }[]>`
			select (select count(*) from places where id = ${place})::int as places,
				(select count(*) from pages where id = ${page})::int as pages,
				(select count(*) from page_links where page_id = ${page})::int as links,
				(select count(*) from places where user_id = ${other})::int as others`;
		expect(left).toEqual({ places: 0, pages: 0, links: 0, others: 1 });
	});

	it('removes the links of a deleted page and forgets the zone of a deleted zone', async () => {
		const u = await user('zone');
		const place = await addPlace(sql, u, spot);
		const zone = '99999999-9999-4999-8999-999999999999';
		await sql.unsafe(
			`insert into zones (id, user_id, name, kind, country, kinds) values ($1, $2, 'Zone', 'country', 'FR', '{VIGILANCE}')`,
			[zone, u]
		);
		await sql`update places set zone_id = ${zone} where id = ${place}`;
		await sql`delete from zones where id = ${zone}`;
		expect((await listPlaces(sql, u))[0].zoneId).toBeNull();

		const page = await createPage(sql, u, 'Page');
		await sql.unsafe(
			"insert into page_links (token_hash, page_id, user_id) values (decode('bb', 'hex'), $1, $2)",
			[page, u]
		);
		await removePage(sql, u, page);
		const [{ n }] = await sql<
			{ n: number }[]
		>`select count(*)::int as n from page_links where user_id = ${u}`;
		expect(n).toBe(0);
	});
});

describe('the way back', () => {
	it('drops what 006 added and the line of the loader, and the migration applies again', async () => {
		await sql.unsafe(read('down', '006_personal_page.down.sql'));
		const tables = await sql<{ table_name: string }[]>`
			select table_name from information_schema.tables where table_name in ('places', 'pages', 'page_links')`;
		expect(tables).toHaveLength(0);
		const columns = await sql`
			select 1 from information_schema.columns where table_name = 'users' and column_name = 'prefs'`;
		expect(columns).toHaveLength(0);
		const [{ n }] = await sql<{ n: number }[]>`
			select count(*)::int as n from schema_migrations where id = '006_personal_page'`;
		expect(n).toBe(0);
		// The other tables are untouched: the accounts are still there.
		const [{ users }] = await sql<{ users: number }[]>`select count(*)::int as users from users`;
		expect(users).toBeGreaterThan(0);

		await sql.unsafe(read('006_personal_page.sql'));
		const back =
			await sql`select 1 from information_schema.columns where table_name = 'users' and column_name = 'prefs'`;
		expect(back).toHaveLength(1);
	});
});
