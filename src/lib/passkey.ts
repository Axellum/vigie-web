// The browser's side of the passkey ceremonies: ask the site for options, let the browser (or the phone)
// make or use the passkey, send its answer back. Errors come back as codes the pages turn into words.
import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
	WebAuthnError
} from '@simplewebauthn/browser';

export type PasskeyFailure =
	| 'unsupported'
	| 'insecure'
	| 'cancelled'
	| 'exists'
	| 'invitation'
	| 'name'
	| 'expired'
	| 'unknown'
	| 'refused'
	| 'network';

export class PasskeyProblem extends Error {
	constructor(public code: PasskeyFailure) {
		super(code);
	}
}

/** Why passkeys cannot work in this browser or at this address; null when they can. */
export function passkeysBlocked(): PasskeyFailure | null {
	if (!window.isSecureContext) return 'insecure';
	if (!browserSupportsWebAuthn()) return 'unsupported';
	return null;
}

async function post(step: string, body: unknown): Promise<Record<string, unknown>> {
	let response: Response;
	try {
		response = await fetch(`/account/passkey/${step}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new PasskeyProblem('network');
	}
	const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok) {
		const code = typeof answer.error === 'string' ? (answer.error as PasskeyFailure) : 'network';
		throw new PasskeyProblem(code);
	}
	return answer;
}

function browserFailure(e: unknown): never {
	if (e instanceof PasskeyProblem) throw e;
	if (e instanceof WebAuthnError && e.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')
		throw new PasskeyProblem('exists');
	// The person closed the browser's window, or the time ran out.
	const names = e instanceof Error ? [e.name, (e.cause as Error | undefined)?.name] : [];
	if (
		(e instanceof WebAuthnError && e.code === 'ERROR_CEREMONY_ABORTED') ||
		names.includes('NotAllowedError') ||
		names.includes('AbortError')
	)
		throw new PasskeyProblem('cancelled');
	throw new PasskeyProblem('refused');
}

/** Creates a passkey: a new account (code and name), a recovered one (code), or one more for the account. */
export async function createPasskey(request: { code?: string; name?: string }): Promise<void> {
	const { id, options } = await post('register-options', request);
	try {
		const response = await startRegistration({ optionsJSON: options as never });
		await post('register', { id, response });
	} catch (e) {
		browserFailure(e);
	}
}

/** Signs in with a passkey of this site. */
export async function signIn(): Promise<void> {
	const { id, options } = await post('login-options', {});
	try {
		const response = await startAuthentication({ optionsJSON: options as never });
		await post('login', { id, response });
	} catch (e) {
		browserFailure(e);
	}
}
