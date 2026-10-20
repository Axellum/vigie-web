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
  countries in view (from zoom 2.3), from `/data/warnings/<cc>.json`, which carries short texts and shared
  shapes (one shape per territory, not one per warning). The full texts come with the alert's page or
  `/data/warning/<cc>/<id>.json`.
- **Near me** (`/near`). The place is chosen in the browser (its position, a click on the map, or the page's
  address, `#lat,lon,radius`) and the matching is done there, on the data every visitor loads: the warnings of
  the countries around it (an area that holds it, a river section within 5 km, the areas within 2 km when a
  simplified coast leaves it outside, like the API's margins) and the hazards within the radius. Which country
  the place is in comes from simplified borders (`src/lib/data/borders.json`, 100 kB compressed, loaded with
  the first place). Only the weather needs the server: the page sends the position rounded to the API's
  weather grid (0.05°, about 5 km), and the server caches each grid point and bounds the requests that reach
  the API (`docs/configuration.md`, "Weather by place").
- **Search by name** (`/data/places.json?q=`). The server keeps the GeoNames places of at least 500 people
  (236,415, with the other names of the cities of 100,000 or more, so that "Genève" or "Londres" are found)
  in memory, read from `data/places.tsv.gz` on the first search. The browser asks after 250 ms without
  typing; a chosen place goes through the same matching as the others.
- **Identifiers.** A hazard keeps the API's feature id. A warning's id is the identifier of the official
  message plus its area's first code: one CAP message often covers several areas, which the API returns as
  one warning each.
- **No data is made up.** A value the API did not give is not shown (or shows "–"). The issuer's texts are
  shown unchanged, in the issuer's languages. The level and phenomenon the site shows come from the API's
  derived fields and are said to be derived.
- **Privacy.** Fonts are bundled. No third-party script, no audience measurement, one cookie (the language).
  The only third-party host is the base map (OpenFreeMap), loaded by the visitor's browser.

## Files

| Path                                            | Role                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/vigie.ts`, `cache.ts`           | The API client and its cache (the only place that talks to the API).                                                                                                 |
| `src/lib/transform.ts`                          | API answers to the site's models (pure functions, tested).                                                                                                           |
| `src/lib/geo.ts`, `src/lib/data/countries.json` | Covered countries and their boxes (Natural Earth, public domain, from the API's own borders).                                                                        |
| `src/lib/near.ts`, `src/lib/data/borders.json`  | Where a place stands: warnings that hold it, rivers and hazards around it, its country (borders simplified by `scripts/build-borders.mjs`).                          |
| `src/lib/places.ts`, `src/lib/server/places.ts` | The search by name, and the places kept in memory (`data/places.tsv.gz`, built by `scripts/build-places.mjs`).                                                       |
| `src/lib/server/budget.ts`                      | The daily bound on the weather requests that reach the API.                                                                                                          |
| `src/lib/components/PointWeather.svelte`        | The weather of a place (`/v1/point`), with the credit of each block.                                                                                                 |
| `src/lib/components/MapView.svelte`             | The MapLibre map: warning zones, hazards, selection.                                                                                                                 |
| `src/routes/`                                   | Pages (`/`, `/near`, `/countries`, `/country/<cc>`, `/country/<cc>/<area>`, `/warning/<cc>/<id>`, `/alert/<id>`, `/sources`, `/about`) and data answers (`/data/*`). |
| `e2e/`                                          | End-to-end tests and the recorded API answers they replay.                                                                                                           |
| `deploy/deck/`                                  | Podman quadlets and Caddyfile for a home server (the Steam Deck).                                                                                                    |
