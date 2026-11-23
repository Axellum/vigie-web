# Configuration

Vigie Web reads its settings from environment variables. Three hold secrets, `DATABASE_URL` (the database
password), `VIGIE_VAPID_PRIVATE_KEY` and the file `VIGIE_FCM_SERVICE_ACCOUNT` names: they live on the server
(Podman secrets), never in the repository.

| Variable                         | Default                            | Meaning                                                                                                                                                                      |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIGIE_API_URL`                  | `http://127.0.0.1:8080`            | Base URL of the Vigie API instance the site reads (from its server only).                                                                                                    |
| `VIGIE_RATE_LIMIT_PER_MINUTE`    | `240`                              | Requests a single address may make per minute (pages and `/data/*`; the site's own files are not counted).                                                                   |
| `PORT`, `HOST`                   | `3000`, `0.0.0.0`                  | Where the Node server listens (adapter-node).                                                                                                                                |
| `ORIGIN`                         | –                                  | The public address of the site, e.g. `https://example.org`: the invitation links (`scripts/invite.mjs`) and the notifications' contact. SvelteKit itself no longer reads it. |
| `PROTOCOL_HEADER`                | –                                  | Behind a reverse proxy: `PROTOCOL_HEADER=X-Forwarded-Proto`, the scheme visitors use. Without it SvelteKit assumes https; forms and passkeys compare it with the browser's.  |
| `ADDRESS_HEADER`, `XFF_DEPTH`    | –                                  | Behind a reverse proxy: `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`, so that the rate limit sees the visitor's address and not the proxy's.                           |
| `VIGIE_PLACES_FILE`              | `data/places.tsv.gz`               | The places of the search by name (`scripts/build-places.mjs`). When it cannot be read, the search answers 503 and the rest works.                                            |
| `DATABASE_URL`                   | –                                  | PostgreSQL of the accounts, e.g. `postgres://vigie:<password>@vigie-db:5432/vigie`. Unset: the site runs without accounts (no "Account" link, `/account` answers 404).       |
| `DATABASE_POOL_MAX`              | `5`                                | Connections the site keeps open to the database.                                                                                                                             |
| `VIGIE_POINT_LOOKUPS_PER_DAY`    | `200`                              | Weather requests of the "near me" page and anonymous point queries that may reach the API in 24 hours (cache misses); `0` turns them off. See below.                         |
| `VIGIE_ME_POINT_LOOKUPS_PER_DAY` | `1000`                             | Daily pool of `/data/point.json` lookups reserved for signed-in accounts on "My page" (`/me`), capped at 500 per account/day; `0` turns them off.                            |
| `VIGIE_WARM_PLACES`              | –                                  | `1` keeps the weather of the places the server knows warm (see "Warming the known places" below). Off unless set.                                                            |
| `VIGIE_WARM_MAX_CELLS`           | `20`                               | Warming: the most grid cells (0.05°) kept warm, the most followed first; `0` turns it off.                                                                                   |
| `VIGIE_WARM_LOOKUPS_PER_DAY`     | `2200`                             | Warming: the weather requests it may make in 24 hours, a budget of its own apart from the three above; `0` turns it off.                                                     |
| `VIGIE_PUBLIC_ORIGIN`            | `https://vigie.auxfilsdesidees.fr` | The public address used in canonical links, social previews and `/sitemap.xml` (another address for a copy of the site).                                                     |
| `VIGIE_VAPID_PUBLIC_KEY`         | –                                  | Notifications: the public key browsers subscribe with (web-push, base64url). Unset, with the private key: no notification.                                                   |
| `VIGIE_VAPID_PRIVATE_KEY`        | –                                  | Notifications: the private key that signs them. Secret. Changing the pair makes every device turn notifications on again.                                                    |
| `VIGIE_VAPID_SUBJECT`            | `ORIGIN` if https                  | Notifications: how a push service can reach the sender (`mailto:` or `https:`); else the project's page.                                                                     |
| `VIGIE_FCM_SERVICE_ACCOUNT`      | –                                  | Notifications of the Android app: the path of the JSON key of a Firebase service account (Firebase Cloud Messaging). Secret. Unset: nothing is sent to the app.              |
| `VIGIE_MAX_APP_DEVICES`          | `5000`                             | The phones of the Android app that may follow places without an account (the bells, see below); at the ceiling a new one is refused (503).                                   |
| `VIGIE_MATCH_INTERVAL_S`         | `120`                              | Seconds between two comparisons of the zones with the alerts in force (5 at least).                                                                                          |
| `VIGIE_PUSH_EXTRA_HOSTS`         | –                                  | Tests only: hosts (`host:port`, comma-separated) accepted as push services besides the browsers' (the end-to-end tests' mock).                                               |
| `VIGIE_FCM_BASE_URL`             | `https://fcm.googleapis.com`       | Tests only: where the messages to the app are posted (the end-to-end tests' mock).                                                                                           |

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
part of it for them. The site therefore keeps its own part bounded: Each answer is cached 15 minutes per grid point (0.05°, the API's forecast grid). Anonymous `/near` lookups share
`VIGIE_POINT_LOOKUPS_PER_DAY` (200 by default, at most 1,500 weighted calls, about 17 % of the quota), while signed-in `/me`
lookups use a separate pool `VIGIE_ME_POINT_LOOKUPS_PER_DAY` (1,000 by default, capped at 500 per account/day). Fresh marine
and TV cache entries are reused across pools without spending another lookup. Beyond its share, the page says that the weather
by place is paused; the warnings and hazards are not affected. The count is in memory: a restart starts it again.

## Warming the known places

With `VIGIE_WARM_PLACES=1` the server asks the API ahead of time for the weather of the places it knows, so that the first opening of
one is quick, on the site and in the Android app (which reads the API's own cache of the same cell): the circle zones that accounts
and the app's devices follow (the bells, the linked app) and the places an account keeps. Places in the same cell of the weather grid
(0.05°) are one cell; at most `VIGIE_WARM_MAX_CELLS` cells are kept, the most followed first. A cell is asked again once the site's
answer has expired (it is kept 15 minutes, as long as the API keeps its own, so the request renews both), one cell at a time, in the same cache entry as a visitor's lookup (so a visitor who asks first
makes it fresh and no request is made). The cost is at most 96 requests to the API a day for each cell, 1,920 for the default 20 cells;
`VIGIE_WARM_LOOKUPS_PER_DAY` (2,200) caps them in a budget of its own, so the warming never uses the lookups of `/near` or `/me`, and
they never use its. The count is in memory: a restart starts it again. No position is written in a log.

## Television screens

The screens for televisions (`/tv`, see [`tv.md`](tv.md)) ask the API for the same things as the surf pages, which the site
keeps, and for the weather of the sky, rain of the hour (kept 15 minutes) and personal-page aurora estimates (kept 1 hour).
That weather and aurora share a budget of their own, `VIGIE_TV_POINT_LOOKUPS_PER_DAY` (5,000 by default, 96 a day for each of
the 51 spots; `0` leaves the sky card empty and the rain "not read"), apart from `VIGIE_POINT_LOOKUPS_PER_DAY` and
`VIGIE_ME_POINT_LOOKUPS_PER_DAY`: a screen left on for weeks cannot use up the weather of the "near me" or "My page" views.
A spot costs at most 96 requests a day, whatever the number of screens that show it.

## Accounts

Accounts sign in with passkeys (no password, no e-mail). They are made by invitation, or by anyone when the site is
open (see below). They need `DATABASE_URL` and
an HTTPS address (a passkey belongs to a host name; browsers refuse them on plain HTTP and on IP addresses).
The site creates its tables at start (`src/lib/server/migrations/`, forward only: a migration only adds) and
removes what has expired every 6 hours. Before a migration reaches the public instance, take a dump
(`deploy/vps/backup.sh`) and keep it; the way back of the latest one is a script outside the loader
(`src/lib/server/migrations/down/`), run by hand, because it deletes what people kept in the tables it drops. Invitations are made by the person who runs the site, in the site's container:

```
podman exec vigie-web node scripts/invite.mjs "for Camille"            # a new account
podman exec vigie-web node scripts/invite.mjs --list                   # accounts and their ids
podman exec vigie-web node scripts/invite.mjs --recover <id> "new phone"  # one more passkey for an account
```

Each prints a link, valid 7 days and once. What the database keeps, and for how long, is in
[`records-of-processing.md`](records-of-processing.md) and on the `/privacy` page.

### Open sign-up

By default only an invitation opens an account. `VIGIE_SIGNUP=open` lets anyone create one at `/join`, with a name
and a passkey, within three limits that ask nothing of the visitor (no puzzle, no third-party script):

| Variable                | Default | Meaning                                                                                                             |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `VIGIE_SIGNUP`          | –       | `open` lets anyone make an account; anything else (or nothing) keeps the invitations.                               |
| `VIGIE_MAX_ACCOUNTS`    | `1000`  | The accounts the site holds at most, all ways of making them counted; at the ceiling, open sign-up says it is full. |
| `VIGIE_SIGNUPS_PER_DAY` | `50`    | The accounts made in the last 24 hours at most, all ways counted; the same answer when it is reached.               |

Besides, one address may ask for 10 sign-ups an hour and make 3 accounts a day, and try 10 recovery codes an hour
(kept in memory, forgotten with the window; behind the proxy the address is the one the proxy gives, see
`ADDRESS_HEADER` of adapter-node). An invitation is the owner's own act: it is never held back by any of this, only
counted. The site is not meant to hold more accounts than the ceiling: the zones of all accounts are compared with
the alerts in force every `VIGIE_MATCH_INTERVAL_S` seconds, so raise it when you have measured the cost.

A person who loses every passkey has no e-mail to fall back on: the account page offers a set of 8 recovery codes,
shown once, kept as a fingerprint, each working once (`/recover` turns one into a 30-minute invitation that adds a
passkey to its account). Before opening sign-up to the public, read the legal notice of `/about` again (publisher, contact, host).

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

### The app's bells, without an account

With `DATABASE_URL` and `VIGIE_FCM_SERVICE_ACCOUNT`, the Android app can also follow its own places without an
account: the bell of a place. The app registers its FCM token and its places at `/account/app/device` (JSON; under
`/account` because the proxy lets only that path write) and gets a secret back, shown once and kept as a SHA-256.
Every request says `Content-Type: application/json`, even without a body (a test, a removal): SvelteKit refuses a
write from another origin without a type, as it would a form.

| Request                         | What it does                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /account/app/device`      | Registers `{token, lang, timeZone, quietHours, places}` and answers `{secret}` (201). The same token again replaces the phone it was. |
| `PUT /account/app/device`       | The same body, with `Authorization: Bearer <secret>`: the places now (401 when the secret is unknown: register again).                |
| `DELETE /account/app/device`    | Forgets the phone, its places and their history (when every bell is off).                                                             |
| `POST /account/app/device/test` | A test notification (10 an hour for a phone).                                                                                         |

A place is `{name, lat, lon, radiusKm?, minLevel?}`: the point is kept to two decimals (about 1 km), the radius is
one of the zones' (10 km when none is given), the level `YELLOW` by default; 10 places at most. Each place is a
circle zone of the phone, compared and told like the zones of an account (the same rules as above; every kind of
alert but the solar storms; the notification's text is the name of the place, and its data names the place's point, `place: "lat,lon"`, for the app to open its warnings). A place kept as it was keeps its baseline; one
that moved or changed level is compared again without notifying. One address may register 30 new phones an hour;
`VIGIE_MAX_APP_DEVICES` caps them all. A phone the app has not shown for 60 days is forgotten with its places: the
app sends its places again at least once a day.

### The app linked to an account

With the same two variables, the app can also be linked to an account by a code, as a screen is (`/tv/pair`), the
other way round: the app asks a code with its FCM token and shows it; the signed-in person enters it on the account
page, part Notifications (the app opens `/account#link=XXXX-XXXX`, the code after `#` never reaches the server); the
phone becomes one of the account's devices and gets the alerts of its zones; the app then picks up a secret of its
own, once. The code (8 characters, 15 minutes, one use), the app's waiting token and its secret are kept as SHA-256;
the secret waits encrypted with the code until the app picks it up (`src/lib/server/appLinks.ts`).

| Request                          | What it does                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST /account/app/link`         | `{token}`: answers `{code, wait, expiresAt}` (201); a new code drops the one the same token asked before. |
| `POST /account/app/link/poll`    | `{wait, code}`: `{status: "pending"}`, `{status: "expired"}`, or `{status: "ready", secret}` once.        |
| `GET /account/app/account`       | With `Authorization: Bearer <secret>`: `{name, quietHours, zones: [{name, minLevel}]}` of the account.    |
| `PUT /account/app/account`       | `{token}`: a new FCM token for the phone.                                                                 |
| `DELETE /account/app/account`    | Unlinks the phone. Removing it from the account page does the same: the secret then answers 401.          |
| `POST /account/app/account/test` | A test notification (10 an hour for a phone).                                                             |

One address may ask 20 codes every 5 minutes; an account may enter 10 codes every 15 minutes. A code not used is
forgotten by the daily clean-up once expired.
