-- Zones to watch: a circle (a point and a radius), a drawn polygon, a country, or an official warning area.
-- The rules of a zone (the lowest level, the kinds of alert) are kept with it.
create extension if not exists postgis;

create table zones (
	id uuid primary key,
	user_id uuid not null references users (id) on delete cascade,
	name text not null check (length(name) between 1 and 60),
	kind text not null check (kind in ('circle', 'polygon', 'country', 'area')),
	-- The surface of a circle or a polygon; null for a country or an area, matched by their codes.
	geom geography(Polygon, 4326),
	lat double precision,
	lon double precision,
	radius_km integer check (radius_km between 1 and 1000),
	country text check (country ~ '^[A-Z]{2}$'),
	area text,
	min_level text not null default 'YELLOW' check (min_level in ('YELLOW', 'ORANGE', 'RED')),
	-- The kinds of alert wanted: 'VIGILANCE' for the official warnings, the API's categories for the hazards.
	kinds text[] not null,
	created_at timestamptz not null default now(),
	check (
		(kind = 'circle' and geom is not null and lat is not null and lon is not null and radius_km is not null)
		or (kind = 'polygon' and geom is not null)
		or (kind = 'country' and country is not null)
		or (kind = 'area' and country is not null and area is not null)
	)
);
create index zones_user on zones (user_id);
create index zones_geom on zones using gist (geom);
