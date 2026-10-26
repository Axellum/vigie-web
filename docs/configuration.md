# Configuration

Vigie Web reads its settings from environment variables. Three hold secrets, `DATABASE_URL` (the database
password), `VIGIE_VAPID_PRIVATE_KEY` and the file `VIGIE_FCM_SERVICE_ACCOUNT` names: they live on the server
(Podman secrets), never in the repository.

| Variable                      | Default                            | Meaning                                                                                                                                                                |
| ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIGIE_API_URL`               | `http://127.0.0.1:8080`            | Base URL of the Vigie API instance the site reads (from its server only).                                                                                              |
| `VIGIE_RATE_LIMIT_PER_MINUTE` | `240`                              | Requests a single address may make per minute (pages and `/data/*`; the site's own files are not counted).                                                             |
| `PORT`, `HOST`                | `3000`, `0.0.0.0`                  | Where the Node server listens (adapter-node).                                                                                                                          |
| `ORIGIN`                      | –                                  | The public address of the site, e.g. `https://example.org` (adapter-node needs it behind a proxy).                                                                     |
| `ADDRESS_HEADER`, `XFF_DEPTH` | –                                  | Behind a reverse proxy: `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`, so that the rate limit sees the visitor's address and not the proxy's.                     |
| `VIGIE_PLACES_FILE`           | `data/places.tsv.gz`               | The places of the search by name (`scripts/build-places.mjs`). When it cannot be read, the search answers 503 and the rest works.                                      |
| `DATABASE_URL`                | –                                  | PostgreSQL of the accounts, e.g. `postgres://vigie:<password>@vigie-db:5432/vigie`. Unset: the site runs without accounts (no "Account" link, `/account` answers 404). |
| `DATABASE_POOL_MAX`           | `5`                                | Connections the site keeps open to the database.                                                                                                                       |
| `VIGIE_POINT_LOOKUPS_PER_DAY` | `200`                              | Weather requests of the "near me" page that may reach the API in 24 hours (cache misses); `0` turns the weather off. See below.                                        |
| `VIGIE_PUBLIC_ORIGIN`         | `https://vigie.auxfilsdesidees.fr` | The public address used in canonical links, social previews and `/sitemap.xml` (another address for a copy of the site).                                               |
| `VIGIE_VAPID_PUBLIC_KEY`      | –                                  | Notifications: the public key browsers subscribe with (web-push, base64url). Unset, with the private key: no notification.                                             |
| `VIGIE_VAPID_PRIVATE_KEY`     | –                                  | Notifications: the private key that signs them. Secret. Changing the pair makes every device turn notifications on again.                                              |
| `VIGIE_VAPID_SUBJECT`         | `ORIGIN` if https                  | Notifications: how a push service can reach the sender (`mailto:` or `https:`); else the project's page.                                                               |
| `VIGIE_FCM_SERVICE_ACCOUNT`   | –                                  | Notifications of the Android app: the path of the JSON key of a Firebase service account (Firebase Cloud Messaging). Secret. Unset: nothing is sent to the app.        |
| `VIGIE_MATCH_INTERVAL_S`      | `120`                              | Seconds between two comparisons of the zones with the alerts in force (5 at least).                                                                                    |
| `VIGIE_PUSH_EXTRA_HOSTS`      | –                                  | Tests only: hosts (`host:port`, comma-separated) accepted as push services besides the browsers' (the end-to-end tests' mock).                                         |
| `VIGIE_FCM_BASE_URL`          | `https://fcm.googleapis.com`       | Tests only: where the messages to the app are posted (the end-to-end tests' mock).                                                                                     |

In development, `npm run dev` reads them from a `.env` file (see `.env.example`).

## Cache times

The site keeps the API's answers in memory (`src/lib/server/vigie.ts`, `TTL_S`): hazards 60 s, warnings of a
country 120 s, state of the sources 60 s, a tile of active fires 600 s. A failed refresh keeps serving the last good answer, marked stale;
a failure with nothing to fall back on is remembered for 15 s, so that a down API is not asked once per
visitor. Pages and `/data/*` answers carry a `Cache-Control` header so that a proxy in front of the site can
serve them too.

## Weather by place

The weather of a place (`/data/point.json`) is the one thing that costs the API's sources something per place:
a new grid point asked of the API cost 7.5 weighted Open-Meteo calls (forecast 5.5, river discharge 1, air 1),
measured on 20 October 2026. Open-Meteo's free quota (10,000 calls a day) is per IP address, so it is shared
with every other client of the same API instance and every program on the same address, and the API keeps no
part of it for them. The site therefore keeps its own part bounded: each answer is cached 15 minutes per grid
point (0.05°, the API's forecast grid), and at most `VIGIE_POINT_LOOKUPS_PER_DAY` requests that miss this
cache reach the API in 24 hours (200 by default, at most 1,500 weighted calls, about 17 % of the quota).
Beyond it, the page says that the weather by place is paused; the warnings and hazards are not affected. The
count is in memory: a restart starts it again.

## Accounts

Accounts are by invitation and sign in with passkeys (no password, no e-mail). They need `DATABASE_URL` and
an HTTPS address (a passkey belongs to a host name; browsers refuse them on plain HTTP and on IP addresses).
The site creates its tables at start (`src/lib/server/migrations/`) and removes what has expired every 6
hours. Invitations are made by the person who runs the site, in the site's container:

```
podman exec vigie-web node scripts/invite.mjs "for Camille"            # a new account
podman exec vigie-web node scripts/invite.mjs --list                   # accounts and their ids
podman exec vigie-web node scripts/invite.mjs --recover <id> "new phone"  # one more passkey for an account
```

Each prints a link, valid 7 days and once. What the database keeps, and for how long, is in
[`records-of-processing.md`](records-of-processing.md) and on the `/privacy` page.

## Notifications

With accounts, the site compares the zones of the accounts with the alerts in force every
`VIGIE_MATCH_INTERVAL_S` seconds, from the data it already caches (the requests to the API depend on the
countries of the zones, not on the number of accounts). What matches is kept 30 days, or as long as the alert
is in force (the account's history, and what the zones were already told).
With the two VAPID keys, it is also sent as a Web Push notification to the browsers of the account, and with
`VIGIE_FCM_SERVICE_ACCOUNT` to its devices of the Android app, through Firebase Cloud Messaging:

- a zone's first comparison is its baseline: what is in force when it is made is not sent;
- an alert is sent once per zone and level, and again only when its level rises;
- quiet hours (an option of the account, 22:00 to 07:00 in the device's time zone): only red alerts are sent;
- 5 devices at most per account, browsers and app together; a device the push service says is gone (404, 410;
  for FCM, `UNREGISTERED`), or that fails 5 times in a row, is forgotten. A failure of the server itself (FCM
  refuses its access token) does not count against the device;
- in the app, a red alert goes to the channel `vigie-red`, the others and the test to `vigie-alerts`: the person
  sets the sound of each in Android's settings.

A Web Push message is encrypted for the browser; an FCM message is not: Google carries its title (level and
title of the alert) and its body (the names of the zones) in clear, as for any Android app. The privacy page
says so.

Only the push services of the browsers are accepted as addresses (Google, Mozilla, Apple, Microsoft), so that
an account cannot make the server call an address of its choosing. Make the keys once, and keep them:

```
npx web-push generate-vapid-keys --json
```

For the app: in the Firebase console of the project, Project settings, Service accounts, "Generate new private
key". Keep the file outside the repository, mount it in the container as a secret, and point
`VIGIE_FCM_SERVICE_ACCOUNT` at it. The server signs a JWT with it and trades it for an access token of one hour
(`src/lib/server/fcm.ts`, without the Firebase SDK).
