# Configuration

Vigie Web reads its settings from environment variables. None is a secret.

| Variable                      | Default                 | Meaning                                                                                                                                            |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIGIE_API_URL`               | `http://127.0.0.1:8080` | Base URL of the Vigie API instance the site reads (from its server only).                                                                          |
| `VIGIE_RATE_LIMIT_PER_MINUTE` | `240`                   | Requests a single address may make per minute (pages and `/data/*`; the site's own files are not counted).                                         |
| `PORT`, `HOST`                | `3000`, `0.0.0.0`       | Where the Node server listens (adapter-node).                                                                                                      |
| `ORIGIN`                      | –                       | The public address of the site, e.g. `https://example.org` (adapter-node needs it behind a proxy).                                                 |
| `ADDRESS_HEADER`, `XFF_DEPTH` | –                       | Behind a reverse proxy: `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`, so that the rate limit sees the visitor's address and not the proxy's. |

In development, `npm run dev` reads them from a `.env` file (see `.env.example`).

## Cache times

The site keeps the API's answers in memory (`src/lib/server/vigie.ts`, `TTL_S`): hazards 60 s, warnings of a
country 120 s, state of the sources 60 s. A failed refresh keeps serving the last good answer, marked stale;
a failure with nothing to fall back on is remembered for 15 s, so that a down API is not asked once per
visitor. Pages and `/data/*` answers carry a `Cache-Control` header so that a proxy in front of the site can
serve them too.
