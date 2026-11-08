// The pages of an account ("My page"): a title and blocks. The blocks are validated against the places of the same
// account (src/lib/pageConfig.ts), so that a page never shows a place that belongs to someone else.
import { randomUUID } from 'node:crypto';
import { MAX_PLACES } from '#lib/myPlaces.js';
import { MAX_BLOCKS, MAX_PAGES, parseBlocks, type Block, type BlocksError } from '#lib/pageConfig.js';
import { starterBlocks } from '#lib/pageStarter.js';
import type { Profile } from '#lib/profiles.js';
import type { Sql } from './db';

export interface Page {
	id: string;
	title: string;
	blocks: Block[];
	/** The address of the public page, when there is one. */
	publicSlug: string | null;
	createdAt: number;
	updatedAt: number;
}

export class PageError extends Error {
	constructor(public code: 'full' | 'unknown' | BlocksError) {
		super(code);
	}
}

type Row = {
	id: string;
	title: string;
	blocks: Block[];
	public_slug: string | null;
	created_at: Date;
	updated_at: Date;
};

function fromRow(r: Row): Page {
	return {
		id: r.id,
		title: r.title,
		blocks: r.blocks,
		publicSlug: r.public_slug,
		createdAt: Math.floor(r.created_at.getTime() / 1000),
		updatedAt: Math.floor(r.updated_at.getTime() / 1000)
	};
}

const UUID = /^[0-9a-f-]{36}$/;

export async function listPages(sql: Sql, userId: string): Promise<Page[]> {
	const rows = await sql<Row[]>`
		select id, title, blocks, public_slug, created_at, updated_at
		from pages where user_id = ${userId} order by created_at`;
	return rows.map(fromRow);
}

export async function getPage(sql: Sql, userId: string, pageId: string): Promise<Page | null> {
	if (!UUID.test(pageId)) return null;
	const [row] = await sql<Row[]>`
		select id, title, blocks, public_slug, created_at, updated_at
		from pages where id = ${pageId} and user_id = ${userId}`;
	return row ? fromRow(row) : null;
}

/** A new page. At most `MAX_PAGES` per account. The blocks are those of `parseBlocks` (already validated against
 *  the places of the account), or none. */
export async function createPage(
	sql: Sql,
	userId: string,
	title: string,
	blocks: Block[] = []
): Promise<string> {
	const id = randomUUID();
	await sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(hashtextextended($1, 6))', [userId]);
		const [{ n }] = await tx.unsafe<{ n: number }[]>(
			'select count(*)::int as n from pages where user_id = $1',
			[userId]
		);
		if (n >= MAX_PAGES) throw new PageError('full');
		await tx.unsafe('insert into pages (id, user_id, title, blocks) values ($1, $2, $3, $4::text::jsonb)', [
			id,
			userId,
			title,
			JSON.stringify(blocks)
		]);
	});
	return id;
}

/** The first page of an account, made when it is first opened: an account that keeps no place yet gets the circle
 *  zones it already follows, copied once as places (each linked to its zone, so that its alerts stay the zone's),
 *  and a page that lays out their first cards. An account with no zone gets an empty page. */
export async function ensureFirstPage(sql: Sql, userId: string, title: string): Promise<Page> {
	const first = (await listPages(sql, userId))[0];
	if (first) return first;
	await sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(hashtextextended($1, 6))', [userId]);
		const [{ pages, places }] = await tx.unsafe<{ pages: number; places: number }[]>(
			`select (select count(*) from pages where user_id = $1)::int as pages,
				(select count(*) from places where user_id = $1)::int as places`,
			[userId]
		);
		if (pages > 0) return;
		if (places === 0)
			await tx.unsafe(
				`insert into places (id, user_id, name, kind, lat, lon, radius_km, profile, zone_id, position)
				select gen_random_uuid(), z.user_id, z.name, 'place', round(z.lat::numeric, 3)::float8,
					round(z.lon::numeric, 3)::float8, z.radius_km, z.profile, z.id,
					(row_number() over (order by z.created_at))::int
				from zones z
				where z.user_id = $1 and z.kind = 'circle' and z.lat is not null and z.lon is not null
					and z.radius_km is not null
				order by z.created_at limit $2`,
				[userId, MAX_PLACES]
			);
		const rows = await tx.unsafe<{ id: string; profile: Profile | null }[]>(
			"select id, profile from places where user_id = $1 and kind = 'place' order by position, created_at",
			[userId]
		);
		await tx.unsafe('insert into pages (id, user_id, title, blocks) values ($1, $2, $3, $4::text::jsonb)', [
			randomUUID(),
			userId,
			title,
			JSON.stringify(starterBlocks(rows))
		]);
	});
	return (await listPages(sql, userId))[0];
}

/** Lays out the first cards of a place at the end of the first page of the account, as many as the page holds.
 *  The number of cards added: none when the place is not the account's, when it already has a card on the page,
 *  or when the page is full. */
export async function appendStarterBlocks(sql: Sql, userId: string, placeId: string): Promise<number> {
	if (!UUID.test(placeId)) return 0;
	return sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(hashtextextended($1, 6))', [userId]);
		const [place] = await tx.unsafe<{ id: string; profile: Profile | null }[]>(
			'select id, profile from places where id = $1 and user_id = $2',
			[placeId, userId]
		);
		const [page] = await tx.unsafe<{ id: string; blocks: Block[] }[]>(
			'select id, blocks from pages where user_id = $1 order by created_at limit 1',
			[userId]
		);
		if (!place || !page || page.blocks.some((b) => b.place === placeId)) return 0;
		const room = MAX_BLOCKS - page.blocks.length;
		const added = starterBlocks([place]).slice(0, Math.max(room, 0));
		if (added.length === 0) return 0;
		await tx.unsafe('update pages set blocks = $2::text::jsonb, updated_at = now() where id = $1', [
			page.id,
			JSON.stringify([...page.blocks, ...added])
		]);
		return added.length;
	});
}

/** Replaces the title and the blocks of a page of this account. `blocks` is what a browser sent (a list or its
 *  JSON): it is read here against the places of the account, and a block that does not fit refuses the whole page. */
export async function savePage(
	sql: Sql,
	userId: string,
	pageId: string,
	title: string,
	blocks: unknown
): Promise<void> {
	if (!UUID.test(pageId)) throw new PageError('unknown');
	await sql.begin(async (tx) => {
		const places = await tx.unsafe<{ id: string }[]>('select id from places where user_id = $1', [userId]);
		const parsed = parseBlocks(blocks, new Set(places.map((p) => p.id)));
		if (!parsed.ok) throw new PageError(parsed.error);
		const updated = await tx.unsafe(
			`update pages set title = $3, blocks = $4::text::jsonb, updated_at = now()
			where id = $1 and user_id = $2 returning id`,
			[pageId, userId, title, JSON.stringify(parsed.blocks)]
		);
		if (updated.length === 0) throw new PageError('unknown');
	});
}

export async function removePage(sql: Sql, userId: string, pageId: string): Promise<void> {
	if (!UUID.test(pageId)) throw new PageError('unknown');
	const removed = await sql`delete from pages where id = ${pageId} and user_id = ${userId} returning id`;
	if (removed.length === 0) throw new PageError('unknown');
}
