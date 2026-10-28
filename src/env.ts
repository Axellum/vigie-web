import { defineEnvVars } from '@sveltejs/kit/env';

// Every setting is read when the server starts and stays `undefined` when it is not set, as with the old
// `$env/dynamic/private`: each module gives its own default (docs/configuration.md).
export const variables = defineEnvVars({
	VIGIE_MATCH_INTERVAL_S: { schema: (input) => input },
	DATABASE_URL: { schema: (input) => input },
	DATABASE_POOL_MAX: { schema: (input) => input },
	VIGIE_FCM_SERVICE_ACCOUNT: { schema: (input) => input },
	VIGIE_FCM_BASE_URL: { schema: (input) => input },
	VIGIE_PUBLIC_ORIGIN: { schema: (input) => input },
	VIGIE_PLACES_FILE: { schema: (input) => input },
	VIGIE_VAPID_PUBLIC_KEY: { schema: (input) => input },
	VIGIE_VAPID_PRIVATE_KEY: { schema: (input) => input },
	VIGIE_PUSH_EXTRA_HOSTS: { schema: (input) => input },
	ORIGIN: { schema: (input) => input },
	VIGIE_VAPID_SUBJECT: { schema: (input) => input },
	VIGIE_RATE_LIMIT_PER_MINUTE: { schema: (input) => input },
	VIGIE_API_URL: { schema: (input) => input },
	VIGIE_POINT_LOOKUPS_PER_DAY: { schema: (input) => input }
});
