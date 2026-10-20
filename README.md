# Vigie Web

A personal project, made with the help of AI and shared in case it helps someone. It comes as is, with
no promise of support, availability or accuracy.

Vigie Web is a website that shows on maps the world natural hazards (earthquakes, cyclones, volcanoes,
floods…) and the official weather warnings that the [Vigie API](https://github.com/Axellum/vigie-api)
gathers from public sources. It does not call any data provider itself: it reads one Vigie API instance,
which caches every feed once for everybody.

> **This is not an official warning service.** The alerts are relayed from public feeds. They can be
> late, incomplete or wrong. Follow the warnings of your national authorities.

## What it shows

- a world map of the current hazards and, for the covered countries, of the official warnings;
- a list that follows the map, with filters by level and by type;
- a page for each country and each area, and a page for each alert with the issuer's text unchanged;
- the state of each source, its licence and its credit.

## Run it

Node.js 22 or newer and a running Vigie API.

```
npm ci
VIGIE_API_URL=http://127.0.0.1:8080 npm run dev
```

`npm run build` writes a Node server to `build/` (`node build` starts it). The settings are environment
variables, listed in [`docs/configuration.md`](docs/configuration.md).

## Licence, data and credits

The code is under the [MIT licence](LICENSE). The data is not: it belongs to each provider and stays under
that provider's terms, which the Vigie API lists in its `SOURCES.md`. Every page shows the credit of the
sources it displays. The base map is © OpenMapTiles and © OpenStreetMap contributors, served by
OpenFreeMap.
