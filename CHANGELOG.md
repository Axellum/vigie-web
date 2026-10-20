# Changelog

All notable changes are listed here. Versions are git tags.

## [Unreleased]

### Added

- World map of the current hazards and, for the covered countries in view, of the official warnings
  (polygons, territories and river sections), with a list that follows the map, filters by level and by type,
  and a side panel for each alert.
- Pages for each covered country, each area, each warning (official text unchanged, in the issuer's languages)
  and each hazard; a list of the covered countries; the state and credits of the sources; an about page.
- French and English, light and dark themes, installable on a phone, opens without a network for the site's
  own files.
- Server-side cache of the API answers, cacheable data answers, security headers, a per-address request limit.
- Unit tests (vitest) and end-to-end tests (Playwright) on recorded API answers; CI.

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
