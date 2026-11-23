// The Android app linked to an account by a short code: the screens' pairing (tvPairing.ts) the other way round.
// The app asks a code with its Firebase Cloud Messaging token and shows it; the signed-in person enters it on the
// account page; the phone becomes one of the account's devices (push_subscriptions) and gets the alerts of its zones.
// The app then picks up, once, a secret of its own (encrypted with the code until then, like a screen's link), with
// which it reads the account's name and zones, gives a new token, asks for a test and unlinks itself. The server keeps
// only digests of the code, of the app's waiting token and of its secret.
import { randomUUID } from 'node:crypto';
import type { Lang } from '#lib/i18n.js';
import type { Level } from '#lib/types.js';
import { digest, newSecret } from './accounts';
import type { Query, Sql } from './db';
import { isFcmToken } from './fcm';
import { keepLatest } from './push';
import { AddressLimits } from './signup';
import {
	decryptToken,
	encryptToken,
	formatPairingCode,
	newPairingCode,
	normalizePairingCode
} from './tvPairing';

export const LINK_TTL_MS = 15 * 60_000;
const PURPOSE = 'vigie-app-link';
const WAIT = /^[A-Za-z0-9_-]{43}$/;

/** New codes: 20 every 5 minutes for an address, as for the screens. */
export const linkStarts = new AddressLimits(20, 5 * 60_000);
/** Codes entered on the account page: 10 every 15 minutes for an account (40 bits of code against guessing). */
export const linkTries = new AddressLimits(10, 15 * 60_000);
/** Test notifications: 10 an hour for a linked phone. */
export const linkTests = new AddressLimits(10, 3_600_000);

export class AppLinkError extends Error {
	constructor(public code: 'invalid') {
		super(code);
	}
}

export interface AppLinkStart {
	/** `XXXX-XXXX`, to show. */
	code: string;
	/** The app's own proof that it asked this code, for the poll. */
	wait: string;
	expiresAt: Date;
}

export type AppLinkPoll = { status: 'pending' } | { status: 'expired' } | { status: 'ready'; secret: string };

/** A new code for the app's token; a code the same token asked before is dropped. */
export async function startAppLink(sql: Sql, token: string, ttlMs = LINK_TTL_MS): Promise<AppLinkStart> {
	if (!isFcmToken(token)) throw new AppLinkError('invalid');
	const rawCode = newPairingCode();
	const wait = newSecret();
	const expiresAt = new Date(Date.now() + ttlMs);
	await sql.begin(async (tx) => {
		await tx`delete from app_link_codes where fcm_token = ${token} or expires_at < now()`;
		await tx`
			insert into app_link_codes (wait_hash, code_hash, fcm_token, expires_at)
			values (${digest(wait)}, ${digest(rawCode)}, ${token}, ${expiresAt})`;
	});
	return { code: formatPairingCode(rawCode), wait, expiresAt };
}

/**
 * The signed-in person enters the code the app shows: the phone becomes one of the account's devices (the same
 * token elsewhere, in this account or another, goes; five devices at most, the oldest goes), with a secret the app
 * picks up at its next poll. Throws AppLinkError('invalid') for a code unknown, expired or already used.
 */
export async function claimAppLink(sql: Sql, userId: string, input: unknown): Promise<void> {
	const rawCode = normalizePairingCode(input);
	if (!rawCode) throw new AppLinkError('invalid');
	const secret = newSecret();
	await sql.begin(async (tx) => {
		const [code] = await tx<{ id: string; fcm_token: string }[]>`
			select id, fcm_token from app_link_codes
			where code_hash = ${digest(rawCode)} and expires_at > now() and claimed_at is null
			for update`;
		if (!code) throw new AppLinkError('invalid');
		await tx`delete from push_subscriptions where fcm_token = ${code.fcm_token}`;
		await tx`
			insert into push_subscriptions (id, user_id, fcm_token, app_secret_hash)
			values (${randomUUID()}, ${userId}, ${code.fcm_token}, ${digest(secret)})`;
		await keepLatest(tx, userId);
		await tx`
			update app_link_codes set secret_cipher = ${encryptToken(rawCode, secret, PURPOSE)}, claimed_at = now()
			where id = ${code.id}`;
	});
}

/** The app asks where its code stands; the secret comes once, then the code is gone. */
export async function pollAppLink(sql: Sql, wait: unknown, code: unknown): Promise<AppLinkPoll> {
	const rawCode = normalizePairingCode(code);
	if (typeof wait !== 'string' || !WAIT.test(wait) || !rawCode) return { status: 'expired' };
	return sql.begin(async (tx) => {
		const [row] = await tx<
			{ id: string; secret_cipher: string | null; expires_at: Date; claimed_at: Date | null }[]
		>`
			select id, secret_cipher, expires_at, claimed_at from app_link_codes
			where wait_hash = ${digest(wait)} and code_hash = ${digest(rawCode)}
			for update`;
		if (!row) return { status: 'expired' } as const;
		if (row.claimed_at && row.secret_cipher) {
			await tx`delete from app_link_codes where id = ${row.id}`;
			const secret = decryptToken(rawCode, row.secret_cipher, PURPOSE);
			return secret ? ({ status: 'ready', secret } as const) : ({ status: 'expired' } as const);
		}
		if (row.expires_at.getTime() <= Date.now()) {
			await tx`delete from app_link_codes where id = ${row.id}`;
			return { status: 'expired' } as const;
		}
		return { status: 'pending' } as const;
	});
}

/** The linked phone of a secret: its row, its account and the account's language; null when unlinked (on the
 *  site, or replaced). */
export async function linkedPhone(
	sql: Query,
	secret: string
): Promise<{ id: string; userId: string; token: string; lang: Lang } | null> {
	const [row] = await sql<{ id: string; user_id: string; fcm_token: string; lang: Lang }[]>`
		select p.id, p.user_id, p.fcm_token, u.lang from push_subscriptions p join users u on u.id = p.user_id
		where p.app_secret_hash = ${digest(secret)}`;
	return row ? { id: row.id, userId: row.user_id, token: row.fcm_token, lang: row.lang } : null;
}

/** What the app shows of the account it is linked to: its name, its quiet hours and its zones (name, lowest level). */
export interface LinkedAccount {
	name: string;
	quietHours: boolean;
	zones: { name: string; minLevel: Level }[];
}

export async function linkedAccount(sql: Query, userId: string): Promise<LinkedAccount | null> {
	const [user] = await sql<{ name: string; quiet_hours: boolean }[]>`
		select name, quiet_hours from users where id = ${userId}`;
	if (!user) return null;
	const zones = await sql<{ name: string; min_level: Level }[]>`
		select name, min_level from zones where user_id = ${userId} order by created_at, name`;
	return {
		name: user.name,
		quietHours: user.quiet_hours,
		zones: zones.map((z) => ({ name: z.name, minLevel: z.min_level }))
	};
}

/** A new token for a linked phone (Firebase renews them). False when the secret is unknown. */
export async function updateLinkedToken(sql: Sql, secret: string, token: string): Promise<boolean> {
	if (!isFcmToken(token)) throw new AppLinkError('invalid');
	return sql.begin(async (tx) => {
		const phone = await linkedPhone(tx, secret);
		if (!phone) return false;
		await tx`delete from push_subscriptions where fcm_token = ${token} and id <> ${phone.id}`;
		await tx`update push_subscriptions set fcm_token = ${token} where id = ${phone.id}`;
		return true;
	});
}

/** The app unlinks itself: the phone is no longer a device of the account. False when the secret is unknown. */
export async function unlinkPhone(sql: Sql, secret: string): Promise<boolean> {
	const removed =
		await sql`delete from push_subscriptions where app_secret_hash = ${digest(secret)} returning id`;
	return removed.length > 0;
}
