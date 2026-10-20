# AGENTS.md

Guide for AI coding agents (and humans in a hurry) working on Vigie Web.

## What this is

A SvelteKit site (Node adapter) that shows the data of one Vigie API instance
([`Axellum/vigie-api`](https://github.com/Axellum/vigie-api)) on maps and pages. The site never calls a
data provider: the API does, once for everybody. Read [`README.md`](README.md) and
[`docs/architecture.md`](docs/architecture.md) first.

## Commands

```
npm ci                      # install the pinned dependencies
npm run dev                 # dev server (VIGIE_API_URL must point to an API)
npm run check               # svelte-check (types)
npm run format:check        # prettier
npm test                    # unit tests (vitest), no network
npm run build               # Node server in build/
npm run test:e2e            # Playwright against the build and a mock API that replays recorded answers
```

Use PowerShell 5.1-compatible commands when you give a command to the owner (no `&&`).

## Rules

1. **Never fabricate data.** A value the API did not give is unknown and shows as "–" or is hidden. No
   default number, no guessed level, no invented place.
2. **Official warnings keep the issuer's words.** Headline, description and instruction are shown as the
   API returns them, in the language the issuer wrote. Never translate, shorten or reword them; the site's
   own labels (level, phenomenon) are marked as derived.
3. **Credit every source.** Every map, list and page that shows data shows the `attribution` the API gave
   for it, and the base map credit. The warning that Vigie does not replace official warnings stays
   visible on every page.
4. **Sober by design.** The site reads the API only from its server, through the cache of
   `src/lib/server/vigie.ts` (one request per key in flight, a TTL per kind of data). Public pages and
   `/data/*` answers carry `Cache-Control` so that a proxy can serve them. The number of requests to the
   API must not grow with the number of visitors.
5. **No secret in the repository.** Settings are environment variables (`docs/configuration.md`).
6. **Privacy.** No third-party script, font or tracker: fonts are bundled, the only third-party host is
   the base map (OpenFreeMap). No cookie except the language choice. A position the visitor gives stays in
   their browser unless they save it in an account: the "near me" page does its matching there, and sends
   only the position rounded to the API's weather grid (about 5 km), for the weather. Never log it.
7. **Tests never touch the network.** Unit tests use recorded API answers from `e2e/fixtures/`; the
   end-to-end tests run against `e2e/mock-api.mjs`, which replays them.
8. **Everything in the repository is in English** (code, comments, commits). The site itself speaks
   French and English (`src/lib/i18n.ts`); a new text gets both.
9. **Public-facing text stays modest**: a personal project, made with AI, shared in case it helps; no
   promise, no marketing word, no detail of a private network or machine.
10. **Git**: work on a branch, one commit per topic, stage files one by one, open a pull request against
    `main`; never push to `main`. Add a line to [`CHANGELOG.md`](CHANGELOG.md) for a visible change.
