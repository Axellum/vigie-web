-- Recovery codes: what lets a person whose passkeys are all lost add a new one, without an e-mail address and without
-- the person who runs the site. A code is shown once, when the person asks for a set; only its SHA-256 is kept. A set
-- replaces the previous one. Using a code makes a short-lived recovery invitation (the table that already exists for
-- the invitations made by hand), so the passkey is added by the same ceremony as before.
--
-- Rolling back: migrations/down/007_recovery_codes.down.sql (kept out of the loader on purpose: it deletes data).

create table recovery_codes (
	code_hash bytea primary key,
	user_id uuid not null references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	used_at timestamptz
);
create index recovery_codes_user on recovery_codes (user_id);
