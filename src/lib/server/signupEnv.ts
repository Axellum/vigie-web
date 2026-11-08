// The sign-up settings of this server, read once from the environment (docs/configuration.md).
import { VIGIE_MAX_ACCOUNTS, VIGIE_SIGNUP, VIGIE_SIGNUPS_PER_DAY } from '$app/env/private';
import { signupConfig, type SignupConfig } from './signup';

let config: SignupConfig | null = null;

export function signupSettings(): SignupConfig {
	config ??= signupConfig({
		mode: VIGIE_SIGNUP,
		maxAccounts: VIGIE_MAX_ACCOUNTS,
		perDay: VIGIE_SIGNUPS_PER_DAY
	});
	return config;
}
