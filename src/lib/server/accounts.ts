// Accounts: invitations, people, sessions. A secret (invitation code, session token) is never stored, only its
// SHA-256, and never logged. A session is a random token in an HttpOnly cookie, the only cookie of an account.
import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { Lang } from '$lib/i18n';
export { cleanName } from '$lib/names';
import type { Sql } from './db';
import { listZones } from './zones';

export const SESSION_COOKIE = 'vigie-session';
export const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

export const newSecret = (bytes = 32): string => randomBytes(bytes).toString('base64url');
export const digest = (secret: string): Buffer => createHash('sha256').update(secret).digest();

export interface User {
	id: string;
	name: string;
	lang: Lang;
	createdAt: Date;
}

/** An invitation code as it appears in a link: 16 to 64 characters of base64url. */
export function isCode(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

function setSessionCookie(cookies: Cookies, token: string, expires: Date, secure: boolean): void {
	cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure, expires });
}

export async function openSession(
	sql: Sql,
	userId: string,
	cookies: Cookies,
	secure: boolean
): Promise<void> {
	const token = newSecret();
	const expires = new Date(Date.now() + SESSION_DAYS * DAY_MS);
	await sql`insert into sessions (token_hash, user_id, expires_at) values (${digest(token)}, ${userId}, ${expires})`;
	setSessionCookie(cookies, token, expires, secure);
}

/** The person signed in with this request's cookie, or null. A session used in its second half is extended. */
export async function sessionUser(sql: Sql, cookies: Cookies, secure: boolean): Promise<User | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const hash = digest(token);
	const [row] = await sql<{ id: string; name: string; lang: Lang; created_at: Date; expires_at: Date }[]>`
		select u.id, u.name, u.lang, u.created_at, s.expires_at
		from sessions s join users u on u.id = s.user_id
		where s.token_hash = ${hash} and s.expires_at > now()`;
	if (!row) {
		cookies.delete(SESSION_COOKIE, { path: '/', secure });
		return null;
	}
	if (row.expires_at.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY_MS) {
		const expires = new Date(Date.now() + SESSION_DAYS * DAY_MS);
		await sql`update sessions set expires_at = ${expires} where token_hash = ${hash}`;
		setSessionCookie(cookies, token, expires, secure);
	}
	await sql`update users set last_seen_at = now() where id = ${row.id} and last_seen_at < now() - interval '1 hour'`;
	return { id: row.id, name: row.name, lang: row.lang, createdAt: row.created_at };
}

export async function closeSession(sql: Sql, cookies: Cookies, secure: boolean): Promise<void> {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await sql`delete from sessions where token_hash = ${digest(token)}`;
	cookies.delete(SESSION_COOKIE, { path: '/', secure });
}

export interface Invitation {
	/** Set for a recovery invitation: the account it adds a passkey to. */
	forUser: { id: string; name: string } | null;
	expiresAt: Date;
}

/** A valid invitation (not used, not expired), or null. */
export async function readInvitation(sql: Sql, code: string): Promise<Invitation | null> {
	if (!isCode(code)) return null;
	const [row] = await sql<{ user_id: string | null; name: string | null; expires_at: Date }[]>`
		select i.user_id, u.name, i.expires_at
		from invitations i left join users u on u.id = i.user_id
		where i.code_hash = ${digest(code)} and i.used_at is null and i.expires_at > now()`;
	if (!row) return null;
	return {
		forUser: row.user_id ? { id: row.user_id, name: row.name ?? '' } : null,
		expiresAt: row.expires_at
	};
}

/** What the database keeps about a person, as they can download it. */
export async function exportUser(sql: Sql, userId: string): Promise<Record<string, unknown>> {
	const [user] = await sql`select name, lang, created_at, last_seen_at from users where id = ${userId}`;
	const passkeys = await sql`
		select id, backed_up, created_at, last_used_at from passkeys where user_id = ${userId} order by created_at`;
	const sessions = await sql`
		select created_at, expires_at from sessions where user_id = ${userId} order by created_at`;
	const devices = await sql`
		select endpoint, fcm_token, created_at, last_sent_at from push_subscriptions
		where user_id = ${userId} order by created_at`;
	const alerts = await sql`
		select a.matched_at, a.level, a.kind, a.title, a.url, a.outcome, z.name as zone
		from zone_alerts a join zones z on z.id = a.zone_id where a.user_id = ${userId} order by a.matched_at`;
	return {
		exported_at: new Date().toISOString(),
		account: user ?? null,
		passkeys: passkeys.map((p) => ({
			...p,
			note: 'The public key of the passkey is kept, never its secret.'
		})),
		sessions,
		zones: await listZones(sql, userId),
		notification_devices: devices.map((d) => ({
			...d,
			note: 'A browser: the address of its push service (the keys that encrypt the messages are not exported). The Android app: its Firebase Cloud Messaging token.'
		})),
		zone_alerts: alerts
	};
}

/** Deletes a person and everything attached to them (passkeys, sessions, invitations, challenges). */
export async function deleteUser(sql: Sql, userId: string): Promise<void> {
	await sql`delete from users where id = ${userId}`;
}

/** Removes what has expired (the history of the zones after 30 days), and the accounts unused for two years. */
export async function cleanUp(sql: Sql): Promise<void> {
	await sql`delete from sessions where expires_at < now()`;
	await sql`delete from challenges where expires_at < now()`;
	await sql`delete from invitations where expires_at < now() - interval '30 days'`;
	await sql`delete from users where last_seen_at < now() - interval '2 years'`;
}
