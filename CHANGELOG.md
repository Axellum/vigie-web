# Changelog

All notable changes are listed here. Versions are git tags.

## [Unreleased]

### Added

- The sky: the aurora. A "Sky" page (`/sky`) with NOAA's OVATION oval on the map (30 to 90 minutes ahead), the Kp
  observed then forecast for three days, the solar wind and NOAA's geomagnetic messages as written; a "Sky" card in
  "Near me" that says in one sentence whether an aurora may be seen tonight from the place, its best hours and where to
  look, marked as the API's estimate with a link to its method and measure (vigie-api ADR 0012). Needs a Vigie API with
  `/v1/sky/aurora`.

- Notifications for the Android app (to come): the server sends the alerts of the zones through Firebase Cloud
  Messaging to a device registered by its token, besides Web Push, with a channel for the red alerts. Off
  without `VIGIE_FCM_SERVICE_ACCOUNT`. The account page lists the app's devices; the privacy page says that
  Google reads these notifications.

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

- Notifications of the zones of an account, as Web Push (when the server has the VAPID keys): turned on per
  device from the account page, with a test notification; a zone's first comparison is not sent, an alert is
  sent once per zone and level; quiet hours (22:00 to 07:00, red alerts only) as an option; the alerts of the
  zones of the last 30 days on the account page, sent or not.

- Zones to watch in an account: a place and a radius (from "near me", a search or a click), a drawn zone, a
  country (from its page) or an official area (from its page), each with the lowest level and the kinds of
  alert wanted; at most 10.
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

- "Near me" in cards: the place in one sentence (the site's own, built from the cards), then the official
  warnings ("nothing in force" and "no source" told apart), the hazards around, the weather, the sea, the sky
  and the air, each folded to a few figures with its detail one click away. A profile (surf, sea, mountain, sky,
  travel, allergies, garden, home automation) orders the cards and goes in the page's address; a warning in
  force always comes first. Places can be followed without an account, in the browser only.

- SvelteKit 3 (with Vite 8, TypeScript 6, adapter-node 6 and Node 22.17 or later): the configuration moves to
  `vite.config.ts`, `$lib` becomes `#lib`, the settings are declared in `src/env.ts`, and the service worker
  is its own TypeScript project. Behind a proxy, set `PROTOCOL_HEADER=X-Forwarded-Proto` (the quadlets do):
  adapter-node no longer reads `ORIGIN`. Closes the Dependabot alerts on `@sveltejs/kit` and `cookie`.
- Faster first paint: the site's small stylesheets are inlined in the page, and the map's stylesheet comes
  with the map instead of blocking the page.
- New logo, an eye with an orange iris, instead of the "V" with a dot: favicon, app icons, the site's header
  and the README.
- No more English or technical text in a French page: the sources of a country are named and counted in the
  page's language (the API's notes for developers are left out), the base map names places in French where
  its tiles have the name, MapLibre's buttons are translated, and the API's own reason for a country without
  a source shows on the English page only.
- The credits of a page are folded under "Sources of this page" at its end, still on every page that shows
  data (an area page now has them too, a country page also credits its hazards).
- On a phone, every tab of the header stays in sight (the map's takes a short name); the map says it is
  loading until its first tiles are drawn, instead of an empty box; "near me" tells the sky of now from the
  most marked weather of the day, and says when the fires come from an earlier reading of NASA's data.
- The place search says it is searching while the answer comes, and keeps the last answer in sight meanwhile.

### Fixed

- The official warnings of the countries in view show from zoom 2.3, so the Europe and United States shortcuts
  bring them on a laptop screen; a country whose warnings fail is named once and asked again after 30 s,
  instead of being asked again in a loop.
- No `Cross-Origin-Opener-Policy` header on plain HTTP, where browsers ignore it and log an error.
- The health check of the Deck container sends `X-Forwarded-For`, without which the server answers 500: the
  container was marked unhealthy while the site worked.
- A description for search engines on the about and sources pages.
- The map page has a heading (hidden from view), its own description and a schema.org `WebSite`; the country
  and area pages say in their description how many official warnings are in force, instead of repeating the
  title.
- Search engines get one address per page and stop wandering: `/country/FR` and `/warning/DE/…` redirect (301)
  to their lower-case address; an area with no warning in force (or a made-up one) is `noindex`; the language
  switch and the "watch this zone" links are `nofollow`, and `robots.txt` keeps crawlers out of `/account`.
- On a phone, a wide table no longer makes the whole page wider than the screen.
- A drawn zone chosen before the map has loaded (a slow phone, a place from "near me") is drawn on that place,
  instead of on the whole world where it was refused as too large.

### Security

- MapLibre GL JS 6.14.0 (was 5.24.0), which fixes a bypass of its HTML sanitizer for attributions
  ([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)). Its worker is now a file of the
  site.
