// The private links of "My page": whoever holds the link sees the page on a screen (a television, a tablet on a wall)
// without signing in, and nothing else. The secret is 24 random bytes, shown once when the link is made; only its
// SHA-256 is kept (like the sessions and the invitations), so that a copy of the database holds no usable link.
//
// What a link shows: the blocks of the page, in order, of the places of the account; never the home (it is dropped
// when the page is read, not only when it is saved), and never anything of the account but its title, units and
// language. The secret never reaches a log, an error message or a page title: this file does not write it anywhere.
import type { Block } from '#lib/pageConfig.js';
import { parsePrefs } from '#lib/prefs.js';
import type { Lang } from '#lib/i18n.js';
import type { Profile } from '#lib/profiles.js';
import { DEFAULT_UNITS, type Units } from '#lib/units.js';
import { digest, newSecret } from './accounts';
import type { Sql } from './db';

/** The active links an account keeps, all pages together. */
export const MAX_LINKS = 10;
/** How long a read is kept in memory: a revoked link stops showing the page within that time at most (at once when
 *  the revocation is made by the same server, which forgets it). */
export const CACHE_SECONDS = 60;
/** The most reads kept in memory: the answers for tokens that do not exist are kept too, and must not pile up. */
const CACHE_MAX = 500;

export class LinkError extends Error {
	constructor(public code: 'full' | 'unknown') {
		super(code);
	}
}

/** A place of a shared page: what a screen needs to ask for its data, and its name. Never the home. */
export interface SharedPlace {
	name: string;
	lat: number;
	lon: number;
	radiusKm: number;
	profile: Profile | null;
}

/** What a private link shows: the title, the blocks in order (the cards of the places that may be shown), and the
 *  units and language of the account. */
export interface SharedPage {
	title: string;
	blocks: { id: string; type: Block['type']; size: Block['size']; place: SharedPlace }[];
	units: Units;
	lang: Lang;
}

/** A link as its owner sees it: never the secret, which only the person who made it has seen. */
export interface PageLink {
	/** The hash of the secret, in hexadecimal: names the link for "revoke" without being able to open it. */
	id: string;
	label: string;
	createdAt: number;
	lastOpenedAt: number | null;
	revoked: boolean;
}

const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const UUID = /^[0-9a-f-]{36}$/;
const HASH = /^[0-9a-f]{64}$/;

/** Makes a link for a page of this account; the secret is returned once and kept nowhere. */
export async function createLink(sql: Sql, userId: string, pageId: string, label: string): Promise<string> {
	if (!UUID.test(pageId)) throw new LinkError('unknown');
	const token = newSecret(24);
	await sql.begin(async (tx) => {
		await tx.unsafe('select pg_advisory_xact_lock(hashtextextended($1, 6))', [userId]);
		const [owned] = await tx.unsafe<{ id: string }[]>('select id from pages where id = $1 and user_id = $2', [
			pageId,
			userId
		]);
		if (!owned) throw new LinkError('unknown');
		const [{ n }] = await tx.unsafe<{ n: number }[]>(
			'select count(*)::int as n from page_links where user_id = $1 and revoked_at is null',
			[userId]
		);
		if (n >= MAX_LINKS) throw new LinkError('full');
		await tx.unsafe('insert into page_links (token_hash, page_id, user_id, label) values ($1, $2, $3, $4)', [
			digest(token),
			pageId,
			userId,
			label.slice(0, 60)
		]);
	});
	return token;
}

type LinkRow = {
	id: string;
	label: string;
	created_at: Date;
	last_opened_at: Date | null;
	revoked_at: Date | null;
};

/** The links of a page of this account, the newest first. */
export async function listLinks(sql: Sql, userId: string, pageId: string): Promise<PageLink[]> {
	if (!UUID.test(pageId)) return [];
	const rows = await sql<LinkRow[]>`
		select encode(token_hash, 'hex') as id, label, created_at, last_opened_at, revoked_at
		from page_links where user_id = ${userId} and page_id = ${pageId} order by created_at desc`;
	return rows.map((r) => ({
		id: r.id,
		label: r.label,
		createdAt: Math.floor(r.created_at.getTime() / 1000),
		lastOpenedAt: r.last_opened_at ? Math.floor(r.last_opened_at.getTime() / 1000) : null,
		revoked: r.revoked_at !== null
	}));
}

/** Revokes a link of this account (it stays listed, as revoked). The reads this server kept are forgotten. */
export async function revokeLink(sql: Sql, userId: string, id: string): Promise<void> {
	if (!HASH.test(id)) throw new LinkError('unknown');
	const done = await sql`
		update page_links set revoked_at = now()
		where encode(token_hash, 'hex') = ${id} and user_id = ${userId} and revoked_at is null returning 1`;
	if (done.length === 0) throw new LinkError('unknown');
	cache.delete(id);
}

type Read = { at: number; page: SharedPage | null };
const cache = new Map<string, Read>();

/** Forgets what was read (for the tests, and for a server that must not serve anything stale). */
export function forgetSharedPages(): void {
	cache.clear();
}

/**
 * The page a link shows: null when the secret is badly formed, unknown or revoked (a screen answers "not found");
 * an exception when the database cannot answer (a screen keeps its last value and says it is offline). Reads are kept
 * `CACHE_SECONDS` in memory, by hash of the secret, because every screen asks again every few minutes.
 */
export async function readSharedPage(sql: Sql, token: string, now = Date.now()): Promise<SharedPage | null> {
	if (!TOKEN.test(token)) return null;
	const hash = digest(token);
	const key = hash.toString('hex');
	const kept = cache.get(key);
	if (kept && now - kept.at < CACHE_SECONDS * 1000) return kept.page;

	const [row] = await sql<
		{ page_id: string; title: string; blocks: Block[]; lang: Lang; prefs: unknown; user_id: string }[]
	>`
		select p.id as page_id, p.title, p.blocks, p.user_id, u.lang, u.prefs
		from page_links l
		join pages p on p.id = l.page_id
		join users u on u.id = p.user_id
		where l.token_hash = ${hash} and l.revoked_at is null`;
	let page: SharedPage | null = null;
	if (row) {
		// The home is never part of a shared page, whatever the blocks say: only the places of kind 'place' are read.
		const places = await sql<
			{ id: string; name: string; lat: number; lon: number; radius_km: number; profile: Profile | null }[]
		>`select id, name, lat, lon, radius_km, profile from places where user_id = ${row.user_id} and kind = 'place'`;
		const byId = new Map(places.map((p) => [p.id, p]));
		page = {
			title: row.title,
			blocks: row.blocks.flatMap((b) => {
				const p = byId.get(b.place);
				return p
					? [
							{
								id: b.id,
								type: b.type,
								size: b.size,
								place: { name: p.name, lat: p.lat, lon: p.lon, radiusKm: p.radius_km, profile: p.profile }
							}
						]
					: [];
			}),
			units: { ...DEFAULT_UNITS, ...parsePrefs(row.prefs).units },
			lang: row.lang
		};
		// At most once an hour: enough to see that a screen still uses the link, without a write at every read.
		await sql`
			update page_links set last_opened_at = now()
			where token_hash = ${hash} and (last_opened_at is null or last_opened_at < now() - interval '1 hour')`;
	}
	if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
	cache.set(key, { at: now, page });
	return page;
}
