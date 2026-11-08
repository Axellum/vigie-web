-- "My page": the places an account keeps, the pages it composes from them, the private links that show a page on
-- a screen without signing in, and the preferences of the person (units). Nothing here changes an existing table
-- except one column on users. The places a person already follows as zones are not copied here: the page offers
-- them when it is first opened (src/lib/server/pages.ts), so that this migration only adds structure.
--
-- Rolling back: migrations/down/006_personal_page.down.sql (kept out of the loader on purpose: it deletes data).

-- A place the person keeps: a point and the radius they look at. The home is a place of kind 'home' (at most one,
-- never public, stored to about 1 km), so that no query can show it by mistake.
create table places (
	id uuid primary key,
	user_id uuid not null references users (id) on delete cascade,
	name text not null check (length(name) between 1 and 60),
	kind text not null default 'place' check (kind in ('place', 'home')),
	lat double precision not null check (lat between -90 and 90),
	lon double precision not null check (lon between -180 and 180),
	radius_km integer not null default 25 check (radius_km between 1 and 1000),
	-- What "near me" shows first for the place (src/lib/profiles.ts); null when none was chosen.
	profile text check (profile in ('surf', 'sea', 'mountain', 'sky', 'travel', 'allergy', 'garden', 'home')),
	-- Shown on the public page of the account, when there is one. The home never is.
	public boolean not null default false,
	-- The zone that sends the alerts of this place, when the person asked for them.
	zone_id uuid references zones (id) on delete set null,
	position integer not null default 0,
	created_at timestamptz not null default now(),
	check (kind <> 'home' or public = false),
	-- The home is never stored finer than two decimals (about 1 km), whatever the code does.
	check (kind <> 'home' or (lat = round(lat::numeric, 2)::float8 and lon = round(lon::numeric, 2)::float8))
);
create index places_user on places (user_id, position);
create unique index places_one_home on places (user_id) where kind = 'home';

-- A page: a title and its blocks, in order. A block is {id, type, place, size}; src/lib/pageConfig.ts validates it.
create table pages (
	id uuid primary key,
	user_id uuid not null references users (id) on delete cascade,
	title text not null check (length(title) between 1 and 60),
	blocks jsonb not null default '[]'
		check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 24 and octet_length(blocks::text) <= 8192),
	-- The address of the public page, when the person made it public; null otherwise.
	public_slug text unique check (public_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index pages_user on pages (user_id);

-- A private link to a page: whoever holds the link sees the page, nothing else. Only the hash of the secret is
-- kept, like the sessions and the invitations; the link is shown once, when it is made.
create table page_links (
	token_hash bytea primary key,
	page_id uuid not null references pages (id) on delete cascade,
	user_id uuid not null references users (id) on delete cascade,
	label text not null default '' check (length(label) <= 60),
	created_at timestamptz not null default now(),
	-- At most once an hour, no address: enough to see that a screen still uses the link.
	last_opened_at timestamptz,
	revoked_at timestamptz
);
create index page_links_page on page_links (page_id);

-- The preferences of the person (src/lib/prefs.ts): the units. The language stays in users.lang.
alter table users add column prefs jsonb not null default '{}'
	check (jsonb_typeof(prefs) = 'object' and octet_length(prefs::text) <= 2048);
