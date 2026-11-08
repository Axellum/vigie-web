import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SharedPage } from '#lib/server/pageLinks.js';

// The route of the private link (ADR 0020 of vigie-api): what it answers when the link is unknown, when the database does not
// answer, and when the page has nothing a screen can draw. The page itself, with its headers, is e2e/tv-private.spec.ts.
const SECRET = 'SECRET-SECRET-SECRET-SECRET-1234';

const state = vi.hoisted(() => ({
	enabled: true,
	read: null as null | (() => Promise<unknown>),
	db: null as null | (() => Promise<unknown>)
}));

vi.mock('#lib/server/db.js', () => ({
	accountsEnabled: () => state.enabled,
	db: () => (state.db ? state.db() : Promise.resolve({ sql: true }))
}));
vi.mock('#lib/server/pageLinks.js', () => ({ readSharedPage: () => state.read!() }));
vi.mock('#lib/server/tvShared.js', () => ({ readBlocks: async () => new Map() }));

import { load } from './+page.server';

const event = (query = '') =>
	({ params: { token: SECRET }, url: new URL(`http://localhost/tv/p/${SECRET}${query}`) }) as never;

const page = (blocks: SharedPage['blocks']): SharedPage => ({
	title: 'Ma page',
	blocks,
	units: {} as SharedPage['units'],
	lang: 'en'
});
const beach = { name: 'Plage', lat: 43.66, lon: -1.44, radiusKm: 25, profile: null };

afterEach(() => {
	state.enabled = true;
	state.read = null;
	state.db = null;
	vi.restoreAllMocks();
});

describe('the route of the private link', () => {
	it('answers 404, as any other 404, when the link is unknown, revoked or badly formed (the reader says null)', async () => {
		state.read = async () => null;
		await expect(load(event())).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
	});

	it('answers 404 on a server without accounts: there are no links there', async () => {
		state.enabled = false;
		state.read = async () => {
			throw new Error('must not be read');
		};
		await expect(load(event())).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
	});

	it('answers 503 and not 404 when the database does not answer, and writes nothing of the request to the log', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		state.read = async () => {
			throw new Error(`connect ECONNREFUSED while reading ${SECRET}`);
		};
		await expect(load(event())).rejects.toMatchObject({ status: 503 });
		expect(log).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET);

		state.read = async () => 'unused';
		state.db = async () => {
			throw new Error('the migrations could not run');
		};
		await expect(load(event())).rejects.toMatchObject({ status: 503 });
	});

	it('shows a message, not an error, for a page with nothing a screen can draw (the home alone, or cards not on a screen)', async () => {
		state.read = async () => page([]);
		const empty = await load(event());
		expect(empty).toMatchObject({ mode: 'empty', screen: null, lang: 'en' });

		state.read = async () => page([{ id: 'aaaa0001', type: 'official', size: 'm', place: beach }]);
		expect(await load(event())).toMatchObject({ mode: 'empty' });
	});

	it('shows the screen of a page that has a card to draw, in the language of the account, with no trace of the secret', async () => {
		state.read = async () => page([{ id: 'aaaa0001', type: 'weather', size: 'm', place: beach }]);
		const shown = await load(event('?d=9&theme=night'));
		expect(shown).toMatchObject({ mode: 'screen', lang: 'en', params: { seconds: 9, theme: 'night' } });
		expect((shown as { screen: { panels: unknown[] } }).screen.panels).toHaveLength(1);
		expect(JSON.stringify(shown)).not.toContain(SECRET);
	});
});
