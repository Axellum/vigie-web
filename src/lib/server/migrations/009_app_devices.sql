-- The devices of the Android app that follow their own places, without an account. The app keeps a secret it
-- was given when it registered (only its SHA-256 is here) and sends it with every change. Its places are zones
-- of the device (circles), compared and told like the zones of an account: same rules, same history.
create table app_devices (
	id uuid primary key,
	secret_hash bytea not null unique,
	fcm_token text not null unique,
	lang text not null default 'fr' check (lang in ('fr', 'en')),
	time_zone text,
	quiet_hours boolean not null default false,
	created_at timestamptz not null default now(),
	-- The last time the app said it was there; a device silent for 60 days is forgotten with its places.
	seen_at timestamptz not null default now(),
	last_sent_at timestamptz,
	failures integer not null default 0
);

-- A zone belongs to an account or to a device of the app, never both.
alter table zones alter column user_id drop not null;
alter table zones add column device_id uuid references app_devices (id) on delete cascade;
alter table zones add constraint zones_one_owner check ((user_id is null) <> (device_id is null));
create index zones_device on zones (device_id);

alter table zone_alerts alter column user_id drop not null;
alter table zone_alerts add column device_id uuid references app_devices (id) on delete cascade;
