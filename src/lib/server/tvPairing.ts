// Short-lived pairing codes for screens without a keyboard (`/tv/pair` -> `/me`).
// The screen displays an 8-character Crockford base32 code (`XXXX-XXXX`) valid for 15 minutes and keeps its own
// waiting token in an HttpOnly cookie. When the signed-in person enters the code on `/me`, a normal private
// `page_links` token is created, encrypted with the code (AES-256-GCM), and stored until the screen polls
// `/tv/pair/poll`, decrypts it once, and deletes the pairing row. Neither the pairing code nor the link secret
// is stored in plaintext in the database.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { digest, newSecret } from './accounts';
import type { Sql } from './db';
import { LinkError, MAX_LINKS } from './pageLinks';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 8;
const SHAPE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export const PAIR_TTL_MS = 15 * 60_000;
export const PAIR_COOKIE = 'vigie-tv-pair';

export class PairingError extends Error {
	constructor(readonly code: 'invalid') {
		super(code);
	}
}

export interface PairingSession {
	/** Formatted with a hyphen (`XXXX-XXXX`) for reading across a room. */
	code: string;
	rawCode: string;
	waitToken: string;
	expiresAt: Date;
}

export type PollResult = { status: 'pending' } | { status: 'expired' } | { status: 'ready'; token: string };

/** A new code: 8 characters of Crockford's base32 (no I, L, O or U), 40 bits. */
export function newPairingCode(): string {
	let out = '';
	for (const byte of randomBytes(LENGTH)) out += ALPHABET[byte & 31];
	return out;
}

export const formatPairingCode = (raw: string): string => `${raw.slice(0, 4)}-${raw.slice(4)}`;

/** Normalises user input: ignores spaces/hyphens/case and maps I/L->1, O->0. */
export function normalizePairingCode(input: unknown): string | null {
	if (typeof input !== 'string' || input.length > 32) return null;
	const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
	return SHAPE.test(code) ? code : null;
}

/** The key a code gives; [purpose] keeps the keys of the screens and of the app apart. */
function cipherKey(rawCode: string, purpose: string): Buffer {
	return createHash('sha256').update(`${purpose}:${rawCode}`).digest();
}

/** A secret encrypted with a code (AES-256-GCM), until the device that shows the code picks it up. */
export function encryptToken(rawCode: string, token: string, purpose = 'vigie-tv-pair'): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', cipherKey(rawCode, purpose), iv);
	const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/** The secret back, or null when the code or the purpose is not the one it was encrypted with. */
export function decryptToken(rawCode: string, packed: string, purpose = 'vigie-tv-pair'): string | null {
	const parts = packed.split('.');
	if (parts.length !== 3) return null;
	try {
		const iv = Buffer.from(parts[0], 'base64url');
		const tag = Buffer.from(parts[1], 'base64url');
		const encrypted = Buffer.from(parts[2], 'base64url');
		const decipher = createDecipheriv('aes-256-gcm', cipherKey(rawCode, purpose), iv);
		decipher.setAuthTag(tag);
		const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
		return TOKEN.test(plain) ? plain : null;
	} catch {
		return null;
	}
}

export function encodePairCookie(session: Pick<PairingSession, 'waitToken' | 'rawCode'>): string {
	return `${session.waitToken}.${session.rawCode}`;
}

export function decodePairCookie(cookie: string | undefined): { waitToken: string; rawCode: string } | null {
	if (!cookie) return null;
	const dot = cookie.indexOf('.');
	if (dot <= 0) return null;
	const waitToken = cookie.slice(0, dot);
	const rawCode = normalizePairingCode(cookie.slice(dot + 1));
	if (!TOKEN.test(waitToken) || !rawCode) return null;
	return { waitToken, rawCode };
}

/** Starts a new pairing session for a screen. */
export async function startPairing(sql: Sql, ttlMs = PAIR_TTL_MS): Promise<PairingSession> {
	const rawCode = newPairingCode();
	const waitToken = newSecret(32);
	const expiresAt = new Date(Date.now() + ttlMs);
	await sql`
		insert into tv_pairing (wait_hash, code_hash, expires_at)
		values (${digest(waitToken)}, ${digest(rawCode)}, ${expiresAt})`;
	return {
		code: formatPairingCode(rawCode),
		rawCode,
		waitToken,
		expiresAt
	};
}

/** Returns the existing unclaimed pairing session when the screen reloads before claiming/expiry, or null. */
export async function resumePairing(
	sql: Sql,
	waitToken: string,
	rawCode: string
): Promise<PairingSession | null> {
	const normalized = normalizePairingCode(rawCode);
	if (!TOKEN.test(waitToken) || !normalized) return null;
	const [row] = await sql<{ expires_at: Date }[]>`
		select expires_at from tv_pairing
		where wait_hash = ${digest(waitToken)} and code_hash = ${digest(normalized)}
			and expires_at > now() and claimed_at is null`;
	if (!row) return null;
	return {
		code: formatPairingCode(normalized),
		rawCode: normalized,
		waitToken,
		expiresAt: row.expires_at
	};
}

/**
 * Claims an active pairing code for an account's personal page, creating a real private link inside the same
 * transaction (so `MAX_LINKS` is enforced without burning the pairing code on failure).
 */
export async function claimPairing(
	sql: Sql,
	userId: string,
	pageId: string,
	inputCode: unknown,
	label = ''
): Promise<void> {
	const rawCode = normalizePairingCode(inputCode);
	if (!rawCode) throw new PairingError('invalid');
	if (!UUID.test(pageId)) throw new LinkError('unknown');

	const linkToken = newSecret(24);
	const packed = encryptToken(rawCode, linkToken);

	await sql.begin(async (tx) => {
		const [pair] = await tx.unsafe<{ id: string }[]>(
			`select id from tv_pairing
			 where code_hash = $1 and expires_at > now() and claimed_at is null
			 for update`,
			[digest(rawCode)]
		);
		if (!pair) throw new PairingError('invalid');

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
			digest(linkToken),
			pageId,
			userId,
			label.trim().slice(0, 60)
		]);
		await tx.unsafe('update tv_pairing set link_cipher = $1, claimed_at = now() where id = $2', [
			packed,
			pair.id
		]);
	});
}

/**
 * Polls the pairing status from the waiting screen. When claimed, returns the private link token once and deletes
 * the pairing row immediately.
 */
export async function pollPairing(sql: Sql, waitToken: string, rawCode: string): Promise<PollResult> {
	const normalized = normalizePairingCode(rawCode);
	if (!TOKEN.test(waitToken) || !normalized) return { status: 'expired' };

	return sql.begin(async (tx) => {
		const [row] = await tx.unsafe<
			{ id: string; link_cipher: string | null; expires_at: Date; claimed_at: Date | null }[]
		>(
			`select id, link_cipher, expires_at, claimed_at from tv_pairing
			 where wait_hash = $1 and code_hash = $2
			 for update`,
			[digest(waitToken), digest(normalized)]
		);
		if (!row) return { status: 'expired' };
		if (row.expires_at.getTime() <= Date.now()) {
			await tx.unsafe('delete from tv_pairing where id = $1', [row.id]);
			return { status: 'expired' };
		}
		if (!row.claimed_at || !row.link_cipher) return { status: 'pending' };

		await tx.unsafe('delete from tv_pairing where id = $1', [row.id]);
		const token = decryptToken(normalized, row.link_cipher);
		return token ? { status: 'ready', token } : { status: 'expired' };
	});
}
