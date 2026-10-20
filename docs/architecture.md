# Architecture

```
visitor ──► Caddy (TLS, the only open door) ──► vigie-web (SvelteKit, Node) ──► vigie-api ──► data providers
                                                     │
                                                     └── base map tiles: the visitor's browser asks OpenFreeMap
```

- **The site never calls a data provider.** It reads one Vigie API instance, from its server only, through
  an in-memory cache (`src/lib/server/vigie.ts`). The API itself fetches each provider's feed once for
  everybody. The number of requests to the API depends on the number of distinct keys (hazards, one
  country's warnings, the providers' state) and on the cache times, not on the number of visitors.
- **What is the same for everybody is rendered on the server**: the list of hazards, the pages of a country,
  an area, an alert. The warnings of the map are loaded by the browser, country by country, for the
  countries in view (from zoom 3), from `/data/warnings/<cc>.json`, which carries short texts and shared
  shapes (one shape per territory, not one per warning). The full texts come with the alert's page or
  `/data/warning/<cc>/<id>.json`.
- **Identifiers.** A hazard keeps the API's feature id. A warning's id is the identifier of the official
  message plus its area's first code: one CAP message often covers several areas, which the API returns as
  one warning each.
- **No data is made up.** A value the API did not give is not shown (or shows "–"). The issuer's texts are
  shown unchanged, in the issuer's languages. The level and phenomenon the site shows come from the API's
  derived fields and are said to be derived.
- **Privacy.** Fonts are bundled. No third-party script, no audience measurement, one cookie (the language).
  The only third-party host is the base map (OpenFreeMap), loaded by the visitor's browser.

## Files

| Path                                            | Role                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/vigie.ts`, `cache.ts`           | The API client and its cache (the only place that talks to the API).                                                                                        |
| `src/lib/transform.ts`                          | API answers to the site's models (pure functions, tested).                                                                                                  |
| `src/lib/geo.ts`, `src/lib/data/countries.json` | Covered countries and their boxes (Natural Earth, public domain, from the API's own borders).                                                               |
| `src/lib/components/MapView.svelte`             | The MapLibre map: warning zones, hazards, selection.                                                                                                        |
| `src/routes/`                                   | Pages (`/`, `/countries`, `/country/<cc>`, `/country/<cc>/<area>`, `/warning/<cc>/<id>`, `/alert/<id>`, `/sources`, `/about`) and data answers (`/data/*`). |
| `e2e/`                                          | End-to-end tests and the recorded API answers they replay.                                                                                                  |
| `deploy/deck/`                                  | Podman quadlets and Caddyfile for a home server (the Steam Deck).                                                                                           |
