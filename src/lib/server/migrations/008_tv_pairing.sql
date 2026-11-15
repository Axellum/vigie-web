-- Short-lived pairing codes to hand a private page link to a screen without a keyboard (`/tv/pair`).
-- No secret link or account identifier is kept in clear: `wait_hash` and `code_hash` are SHA-256 digests, and
-- `link_cipher` holds the link secret encrypted with the one-time code until the screen picks it up.
create table tv_pairing (
	id uuid primary key default gen_random_uuid(),
	wait_hash bytea unique not null,
	code_hash bytea unique not null,
	link_cipher text,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	claimed_at timestamptz
);

create index tv_pairing_expires on tv_pairing (expires_at);
