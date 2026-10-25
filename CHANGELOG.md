# Changelog

All notable changes are listed here. Versions are git tags.

## [Unreleased]

### Added

- The public instance opens the API's reads at `https://vigie.auxfilsdesidees.fr/v1` (GET and the WebSocket
  `/v1/stream` only), through Caddy, with a rate limit per address (stricter on `/v1/point`) and cache headers.

- Search engines: `/sitemap.xml` (the fixed pages and one page per served country, no invented date), listed in
  `robots.txt`; a canonical address and a basic social preview on every public page.

- World map of the current hazards and, for the covered countries in view, of the official warnings
  (polygons, territories and river sections), with a list that follows the map, filters by level and by type,
  and a side panel for each alert.
- Pages for each covered country, each area, each warning (official text unchanged, in the issuer's languages)
  and each hazard; a list of the covered countries; the state and credits of the sources; an about page.
- French and English, light and dark themes, installable on a phone, opens without a network for the site's
  own files.
- Server-side cache of the API answers, cacheable data answers, security headers, a per-address request limit.
- Unit tests (vitest) and end-to-end tests (Playwright) on recorded API answers; CI.

- "Near me" page: for a place (the browser's position, a click on the map, or the page's address), the official
  warnings that hold it, the river sections within 5 km, the hazards within a chosen radius, and its weather (now,
  rain in the next hour, next days, air, river discharge, sea, space weather). The matching is done in the browser;
  only a position rounded to about 5 km is sent, for the weather, which the server caches per grid point and
  bounds per day (`VIGIE_POINT_LOOKUPS_PER_DAY`).

- Search of a place by name on the "near me" page: the GeoNames places of at least 500 people, with the names in
  other languages of the large cities; "Paris, Texas" narrows by region or country.

- Zones to watch in an account: a place and a radius (from "near me", a search or a click), a drawn zone, a
  country (from its page) or an official area (from its page), each with the lowest level and the kinds of
  alert wanted; at most 10. They are kept for the notifications, which do not exist yet.
- Accounts, by invitation, when the server has a database (`DATABASE_URL`): an invitation link opens an
  account with a passkey (no password, no e-mail); sign in with a passkey; add one for another device, or
  through a recovery invitation; download everything the site keeps; delete the account at once. A privacy
  page says what is kept and for how long. `scripts/invite.mjs` makes the invitations.
- The covered countries are the ones the API serves (48 with its default settings, among them Mexico,
  Argentina, Algeria, the Philippines, Jamaica and Barbados); the list says when a source's reuse licence is
  not confirmed. "Near me" names a country with no source (borders of 135 countries).
- The countries without official warnings, and why, as the API says it (vigie-api 9da278c): on the countries page,
  grouped by reason; on "near me", the reason for the place's country, with the API's own sentence in English. The
  borders now hold every country, so "near me" names the country of any place on land.
- What an earthquake or a volcanic event is close to: the named active faults (GEM) and the volcanoes the sources
  report, with their distance, marked as calculated by Vigie; nothing for a storm or a flood, which are not compared.
- Active fires seen by satellite (NASA FIRMS), off until ticked on the world map: cells that count the
  detections of the last 24 hours, then each detection up close, with its time, radiative power, confidence and
  satellite; on "near me", the detections within 50 km. NASA's credit and disclaimer are shown, and the site
  says that a detection is not an alert.
- Installation on a rented server (`deploy/vps/`): the site, its API and the accounts' database (PostgreSQL with
  PostGIS), HTTPS by Caddy, a firewall, and a dump of the database every day. The privacy page says the backups
  are kept 7 days at most.
- Forecasts of storms and tsunamis, when the API has one: on the map, the cone, the track, the forecast
  positions and the coastal warnings of a storm, or the arrival times of a tsunami at the places the warning
  centre names; in the panel and on the hazard's page, the same in a table, with a link to the official
  bulletin. A tsunami's page shows the official messages of the warning centre, unchanged.

### Changed

- Faster first paint: the site's small stylesheets are inlined in the page, and the map's stylesheet comes
  with the map instead of blocking the page.

### Fixed

- The official warnings of the countries in view show from zoom 2.3, so the Europe and United States shortcuts
  bring them on a laptop screen; a country whose warnings fail is named once and asked again after 30 s,
  instead of being asked again in a loop.
- No `Cross-Origin-Opener-Policy` header on plain HTTP, where browsers ignore it and log an error.
- The health check of the Deck container sends `X-Forwarded-For`, without which the server answers 500: the
  container was marked unhealthy while the site worked.
- A description for search engines on the about and sources pages.
- On a phone, a wide table no longer makes the whole page wider than the screen.
