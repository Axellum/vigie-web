-- The Android app linked to an account by a short code (appLinks.ts), as a screen is (tv_pairing), the other way round:
-- the app asks a code with its Firebase token, the signed-in person enters it on the account page, and the phone becomes
-- one of the account's devices. Neither the code nor the app's secret is kept in clear: `wait_hash` and `code_hash`
-- are SHA-256 digests, and `secret_cipher` holds the app's secret encrypted with the code until the app picks it up.
create table app_link_codes (
	id uuid primary key default gen_random_uuid(),
	wait_hash bytea unique not null,
	code_hash bytea unique not null,
	fcm_token text not null,
	secret_cipher text,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	claimed_at timestamptz
);

create index app_link_codes_expires on app_link_codes (expires_at);

-- A phone linked that way asks for itself (the account's zones, a new token, a test, unlinking) with a secret of which
-- the server keeps the digest. Null for a browser and for the app's devices registered before.
alter table push_subscriptions add column app_secret_hash bytea unique;
