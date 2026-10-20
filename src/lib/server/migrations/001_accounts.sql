-- Accounts: people invited by the owner of the site, who sign in with passkeys (no password, no e-mail).
-- A secret (invitation code, session token) is never stored: only its SHA-256.

create table users (
	id uuid primary key,
	name text not null check (length(name) between 1 and 60),
	lang text not null default 'fr' check (lang in ('fr', 'en')),
	created_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now()
);

-- Single use. A recovery invitation (user_id set) adds a passkey to an existing account.
create table invitations (
	code_hash bytea primary key,
	note text,
	user_id uuid references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	used_at timestamptz
);

create table passkeys (
	id text primary key,
	user_id uuid not null references users (id) on delete cascade,
	public_key bytea not null,
	counter bigint not null default 0,
	transports text not null default '',
	backed_up boolean not null default false,
	created_at timestamptz not null default now(),
	last_used_at timestamptz
);
create index passkeys_user on passkeys (user_id);

create table sessions (
	token_hash bytea primary key,
	user_id uuid not null references users (id) on delete cascade,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);

-- The challenge of one passkey ceremony: kept 5 minutes, used once.
create table challenges (
	id uuid primary key,
	challenge text not null,
	kind text not null check (kind in ('register', 'add', 'login')),
	invitation_hash bytea,
	user_id uuid references users (id) on delete cascade,
	new_user_id uuid,
	name text,
	lang text,
	expires_at timestamptz not null
);
