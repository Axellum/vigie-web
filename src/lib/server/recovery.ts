// Recovery codes: a person who has lost every passkey can add a new one with a code they kept, with no e-mail
// address and without asking the person who runs the site. A set of 8 codes is shown once, when it is made; only
// the SHA-256 of each code is kept; making a set replaces the previous one; a code works once. Using one makes a
// 30-minute recovery invitation (the table of the invitations made by hand), so the passkey is added by the
// same ceremony as for any account, and nothing in passkeys.ts needs to know about codes.
import { randomBytes } from 'node:crypto';
import { digest, newSecret } from './accounts';
import type { Sql } from './db';

export const RECOVERY_CODES = 8;
/** Crockford's base32: no I, L, O or U, so a code copied by hand is hard to misread. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20;
const SHAPE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

/** A code of 20 characters, 100 bits: 256 is a multiple of 32, so each byte gives one character without bias. */
function newCode(): string {
	let code = '';
	for (const byte of randomBytes(LENGTH)) code += ALPHABET[byte & 31];
	return code;
}

/** A code as it is shown and written down: four groups of five characters. */
export const showCode = (code: string): string => code.match(/.{5}/g)!.join('-');

/** What a person typed, as the code it stands for (case, spaces, hyphens and the look-alike characters ignored). */
export function normalizeCode(input: unknown): string | null {
	if (typeof input !== 'string' || input.length > 64) return null;
	const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
	return SHAPE.test(code) ? code : null;
}

/** Makes a new set for the account, in place of the one it had; the codes are returned, this once. */
export async function makeRecoveryCodes(sql: Sql, userId: string): Promise<string[]> {
	const codes = Array.from({ length: RECOVERY_CODES }, newCode);
	await sql.begin(async (tx) => {
		await tx.unsafe('delete from recovery_codes where user_id = $1', [userId]);
		for (const code of codes)
			await tx.unsafe('insert into recovery_codes (code_hash, user_id) values ($1, $2)', [
				digest(code),
				userId
			]);
	});
	return codes.map(showCode);
}

/** How many codes of the account can still be used, and how many it was given. */
export async function recoveryStatus(
	sql: Sql,
	userId: string
): Promise<{ remaining: number; total: number }> {
	const [row] = await sql<{ remaining: string; total: string }[]>`
		select count(*) filter (where used_at is null)::text as remaining, count(*)::text as total
		from recovery_codes where user_id = ${userId}`;
	return { remaining: Number(row.remaining), total: Number(row.total) };
}

/**
 * Spends a code. For a good one: the code of a recovery invitation for its account (the page /join/<code> adds the
 * passkey), valid 30 minutes. For a wrong, used or badly written one: null, the same answer in every case.
 */
export async function useRecoveryCode(sql: Sql, input: unknown): Promise<string | null> {
	const code = normalizeCode(input);
	if (!code) return null;
	return sql.begin(async (tx) => {
		const used = await tx.unsafe<{ user_id: string }[]>(
			'update recovery_codes set used_at = now() where code_hash = $1 and used_at is null returning user_id',
			[digest(code)]
		);
		if (used.length === 0) return null;
		const invitation = newSecret(18);
		await tx.unsafe(
			`insert into invitations (code_hash, note, user_id, expires_at)
			 values ($1, 'recovery code', $2, now() + interval '30 minutes')`,
			[digest(invitation), used[0].user_id]
		);
		return invitation;
	});
}
