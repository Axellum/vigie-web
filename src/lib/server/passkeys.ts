// Passkeys (WebAuthn): creating one (a new account from an invitation, or one more passkey for an account)
// and signing in with one. The site keeps the public key only. The relying party is the site's own host
// name, so a passkey made on one address does not work on another, and an IP address cannot have any.
import { randomUUID } from 'node:crypto';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import type { Lang } from '#lib/i18n.js';
import { digest, readInvitation, type User } from './accounts';
import type { Sql } from './db';

const CHALLENGE_MINUTES = 5;
const RP_NAME = 'Vigie';

/** Why a ceremony failed, as a code the page turns into words. */
export class PasskeyError extends Error {
	constructor(public code: 'invitation' | 'name' | 'expired' | 'unknown' | 'refused' | 'last') {
		super(code);
	}
}

function party(url: URL): { rpID: string; origin: string } {
	return { rpID: url.hostname, origin: url.origin };
}

/** A user handle for WebAuthn: the 16 bytes of the account's UUID. */
function handle(userId: string): Uint8Array<ArrayBuffer> {
	return new Uint8Array(Buffer.from(userId.replace(/-/g, ''), 'hex'));
}

async function keepChallenge(
	sql: Sql,
	challenge: string,
	fields: {
		kind: 'register' | 'add' | 'login';
		invitationHash?: Buffer | null;
		userId?: string | null;
		newUserId?: string | null;
		name?: string | null;
		lang?: Lang | null;
	}
): Promise<string> {
	const id = randomUUID();
	const expires = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
	await sql`insert into challenges (id, challenge, kind, invitation_hash, user_id, new_user_id, name, lang, expires_at)
		values (${id}, ${challenge}, ${fields.kind}, ${fields.invitationHash ?? null}, ${fields.userId ?? null},
			${fields.newUserId ?? null}, ${fields.name ?? null}, ${fields.lang ?? null}, ${expires})`;
	return id;
}

type Challenge = {
	challenge: string;
	kind: 'register' | 'add' | 'login';
	invitation_hash: Buffer | null;
	user_id: string | null;
	new_user_id: string | null;
	name: string | null;
	lang: Lang | null;
};

/** Takes a challenge once: it is deleted whatever happens next. */
async function takeChallenge(sql: Sql, id: unknown): Promise<Challenge> {
	if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new PasskeyError('expired');
	const [row] = await sql<Challenge[]>`
		delete from challenges where id = ${id} and expires_at > now()
		returning challenge, kind, invitation_hash, user_id, new_user_id, name, lang`;
	if (!row) throw new PasskeyError('expired');
	return row;
}

/**
 * Options to create a passkey: for a new account (an invitation and a name), for an account an invitation
 * recovers (an invitation), or for the account signed in (no invitation).
 */
export async function registrationOptions(
	sql: Sql,
	url: URL,
	request: { code?: string; name?: string | null; lang: Lang; user: User | null }
): Promise<{ id: string; options: PublicKeyCredentialCreationOptionsJSON }> {
	let kind: 'register' | 'add';
	let userId: string;
	let userName: string;
	let invitationHash: Buffer | null = null;
	if (request.code !== undefined) {
		const invitation = await readInvitation(sql, request.code);
		if (!invitation) throw new PasskeyError('invitation');
		invitationHash = digest(request.code);
		if (invitation.forUser) {
			kind = 'add';
			userId = invitation.forUser.id;
			userName = invitation.forUser.name;
		} else {
			if (!request.name) throw new PasskeyError('name');
			kind = 'register';
			userId = randomUUID();
			userName = request.name;
		}
	} else if (request.user) {
		kind = 'add';
		userId = request.user.id;
		userName = request.user.name;
	} else {
		throw new PasskeyError('refused');
	}
	const existing =
		kind === 'add'
			? await sql<
					{ id: string; transports: string }[]
				>`select id, transports from passkeys where user_id = ${userId}`
			: [];
	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: party(url).rpID,
		userName,
		userID: handle(userId),
		attestationType: 'none',
		excludeCredentials: existing.map((p) => ({
			id: p.id,
			transports: p.transports ? p.transports.split(',') : undefined
		})),
		authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
	});
	const id = await keepChallenge(sql, options.challenge, {
		kind,
		invitationHash,
		userId: kind === 'add' ? userId : null,
		newUserId: kind === 'register' ? userId : null,
		name: kind === 'register' ? userName : null,
		lang: request.lang
	});
	return { id, options };
}

/** Checks a new passkey and keeps it; returns the account it belongs to (created for a new account). */
export async function register(
	sql: Sql,
	url: URL,
	id: unknown,
	response: RegistrationResponseJSON,
	signedIn: User | null
): Promise<string> {
	const c = await takeChallenge(sql, id);
	if (c.kind === 'login') throw new PasskeyError('expired');
	// A passkey added without an invitation goes to the account signed in, and only to it.
	if (!c.invitation_hash && (!signedIn || signedIn.id !== c.user_id)) throw new PasskeyError('refused');
	const { rpID, origin } = party(url);
	let verified;
	try {
		verified = await verifyRegistrationResponse({
			response,
			expectedChallenge: c.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			requireUserVerification: false
		});
	} catch {
		throw new PasskeyError('refused');
	}
	if (!verified.verified) throw new PasskeyError('refused');
	const { credential, credentialBackedUp } = verified.registrationInfo;
	return sql.begin(async (tx) => {
		if (c.invitation_hash) {
			const used = await tx.unsafe(
				'update invitations set used_at = now() where code_hash = $1 and used_at is null and expires_at > now() returning code_hash',
				[c.invitation_hash]
			);
			if (used.length === 0) throw new PasskeyError('invitation');
		}
		const userId = c.kind === 'register' ? c.new_user_id! : c.user_id!;
		if (c.kind === 'register') {
			await tx.unsafe('insert into users (id, name, lang) values ($1, $2, $3)', [
				userId,
				c.name,
				c.lang ?? 'fr'
			]);
		}
		await tx.unsafe(
			'insert into passkeys (id, user_id, public_key, counter, transports, backed_up) values ($1, $2, $3, $4, $5, $6)',
			[
				credential.id,
				userId,
				Buffer.from(credential.publicKey),
				credential.counter,
				(credential.transports ?? []).join(','),
				credentialBackedUp
			]
		);
		return userId;
	});
}

/** Options to sign in with any passkey of this site (the browser offers the ones it has). */
export async function authenticationOptions(
	sql: Sql,
	url: URL
): Promise<{ id: string; options: PublicKeyCredentialRequestOptionsJSON }> {
	const options = await generateAuthenticationOptions({
		rpID: party(url).rpID,
		userVerification: 'preferred'
	});
	const id = await keepChallenge(sql, options.challenge, { kind: 'login' });
	return { id, options };
}

/** Checks a sign-in; returns the account of the passkey. */
export async function authenticate(
	sql: Sql,
	url: URL,
	id: unknown,
	response: AuthenticationResponseJSON
): Promise<string> {
	const c = await takeChallenge(sql, id);
	if (c.kind !== 'login') throw new PasskeyError('expired');
	if (typeof response?.id !== 'string') throw new PasskeyError('unknown');
	const [key] = await sql<
		{ id: string; user_id: string; public_key: Buffer; counter: string; transports: string }[]
	>`
		select id, user_id, public_key, counter, transports from passkeys where id = ${response.id}`;
	if (!key) throw new PasskeyError('unknown');
	const { rpID, origin } = party(url);
	let verified;
	try {
		verified = await verifyAuthenticationResponse({
			response,
			expectedChallenge: c.challenge,
			expectedOrigin: origin,
			expectedRPID: rpID,
			credential: {
				id: key.id,
				publicKey: new Uint8Array(key.public_key),
				counter: Number(key.counter),
				transports: key.transports ? key.transports.split(',') : undefined
			},
			requireUserVerification: false
		});
	} catch {
		throw new PasskeyError('refused');
	}
	if (!verified.verified) throw new PasskeyError('refused');
	await sql`update passkeys set counter = ${verified.authenticationInfo.newCounter},
		backed_up = ${verified.authenticationInfo.credentialBackedUp}, last_used_at = now() where id = ${key.id}`;
	return key.user_id;
}

/** Removes one passkey of an account, never its last one (the account could no longer be opened). */
export async function removePasskey(sql: Sql, userId: string, passkeyId: string): Promise<void> {
	await sql.begin(async (tx) => {
		const keys = await tx.unsafe<{ id: string }[]>('select id from passkeys where user_id = $1 for update', [
			userId
		]);
		if (!keys.some((k) => k.id === passkeyId)) throw new PasskeyError('unknown');
		if (keys.length === 1) throw new PasskeyError('last');
		await tx.unsafe('delete from passkeys where id = $1 and user_id = $2', [passkeyId, userId]);
	});
}
