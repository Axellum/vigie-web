// Who may open an account without an invitation, and how fast. An invitation (scripts/invite.mjs) is the owner's own
// act and is never held back by what is below; "open" is a setting (VIGIE_SIGNUP) that lets anyone create an account
// with a passkey, within three limits that cost nothing and ask for nothing from the visitor (no third-party script,
// no puzzle): a ceiling on the accounts, a ceiling on the accounts made in 24 hours, and a small share of tries for
// each address. Nothing here reads the environment: src/lib/server/signupEnv.ts does, so that tests can give a
// configuration of their own.
import type { TransactionSql } from 'postgres';
import { SlidingBudget } from './budget';
import type { Query } from './db';

export type SignupMode = 'open' | 'invitation';
/** What the site answers to someone who wants an account: it is open, by invitation only, or full for now. */
export type SignupStatus = SignupMode | 'full';

export interface SignupConfig {
	mode: SignupMode;
	/** The accounts the site holds at most, all ways of making them counted. */
	maxAccounts: number;
	/** The accounts made in the last 24 hours at most, all ways of making them counted. */
	perDay: number;
}

export const DEFAULT_MAX_ACCOUNTS = 1000;
export const DEFAULT_SIGNUPS_PER_DAY = 50;

function whole(value: unknown, fallback: number): number {
	if (value === undefined || value === null || String(value).trim() === '') return fallback;
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** The settings as the environment gives them (text or nothing). Anything but "open" keeps the invitations. */
export function signupConfig(env: { mode?: unknown; maxAccounts?: unknown; perDay?: unknown }): SignupConfig {
	return {
		mode:
			String(env.mode ?? '')
				.trim()
				.toLowerCase() === 'open'
				? 'open'
				: 'invitation',
		maxAccounts: whole(env.maxAccounts, DEFAULT_MAX_ACCOUNTS),
		perDay: whole(env.perDay, DEFAULT_SIGNUPS_PER_DAY)
	};
}

/** Whether an account may be opened now without an invitation. */
export async function signupStatus(q: Query, config: SignupConfig): Promise<SignupStatus> {
	if (config.mode !== 'open') return 'invitation';
	const [row] = await q<{ total: string; today: string }[]>`
		select count(*)::text as total,
			count(*) filter (where created_at > now() - interval '24 hours')::text as today
		from users`;
	return Number(row.total) >= config.maxAccounts || Number(row.today) >= config.perDay ? 'full' : 'open';
}

/**
 * The same answer, inside the transaction that makes the account, after taking a lock so that two sign-ups
 * at the last place cannot both pass. The lock lasts until the transaction ends.
 */
export async function claimSignup(tx: TransactionSql, config: SignupConfig): Promise<SignupStatus> {
	await tx.unsafe('select pg_advisory_xact_lock(20261108)');
	return signupStatus(tx, config);
}

/**
 * A share of tries for each address in a window, kept in memory (one server process, like the site's request
 * limit): enough to stop a script, not to know who anyone is. The addresses are forgotten with the window.
 */
export class AddressLimits {
	private readonly byAddress = new Map<string, SlidingBudget>();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now
	) {}

	/** Counts one try for this address and returns true, or returns false when its share is used up. */
	take(address: string): boolean {
		let budget = this.byAddress.get(address);
		if (!budget) {
			if (this.byAddress.size >= 10_000) {
				for (const [key, b] of this.byAddress) if (b.used() === 0) this.byAddress.delete(key);
			}
			budget = new SlidingBudget(this.limit, this.windowMs, this.now);
			this.byAddress.set(address, budget);
		}
		return budget.take();
	}
}

const HOUR_MS = 3_600_000;
/** Asking to open an account (the options of the passkey): 10 an hour for an address. */
export const signupTries = new AddressLimits(10, HOUR_MS);
/** Accounts made without an invitation: 3 in 24 hours for an address. */
export const signupsMade = new AddressLimits(3, 24 * HOUR_MS);
/** Recovery codes tried: 10 an hour for an address. */
export const recoveryTries = new AddressLimits(10, HOUR_MS);
