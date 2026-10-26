-- Notifications: the devices an account receives push notifications on, and the alerts its zones matched.

-- A device: the push service's address for it and the keys that encrypt what is sent to it (RFC 8291). The
-- service only carries an encrypted message; it cannot read it.
create table push_subscriptions (
	id uuid primary key,
	user_id uuid not null references users (id) on delete cascade,
	endpoint text not null unique,
	p256dh text not null,
	auth text not null,
	created_at timestamptz not null default now(),
	last_sent_at timestamptz,
	failures integer not null default 0
);
create index push_subscriptions_user on push_subscriptions (user_id);

-- The alerts a zone matched, for the account's history (30 days). One row per alert, zone and level: an
-- alert that rises to a higher level is told again.
create table zone_alerts (
	id bigserial primary key,
	user_id uuid not null references users (id) on delete cascade,
	zone_id uuid not null references zones (id) on delete cascade,
	alert_key text not null,
	kind text not null,
	level text not null check (level in ('YELLOW', 'ORANGE', 'RED')),
	title text not null,
	url text not null,
	matched_at timestamptz not null default now(),
	-- 'sent' (to at least one device), 'quiet' (quiet hours), 'baseline' (already in force when the zone was
	-- made), 'none' (no device), 'failed' (every device failed).
	outcome text not null check (outcome in ('sent', 'quiet', 'baseline', 'none', 'failed')),
	unique (zone_id, alert_key, level)
);
create index zone_alerts_user on zone_alerts (user_id, matched_at desc);

-- A zone is compared once without notifying: what is already in force when it is made is not news.
alter table zones add column baseline_done boolean not null default false;

-- Quiet hours (22:00 to 07:00 in the person's time zone): only red alerts are sent.
alter table users add column quiet_hours boolean not null default false;
alter table users add column time_zone text;
