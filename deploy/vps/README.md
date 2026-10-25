# Running Vigie on a rented server

The public instance: a small rented server (Debian 13, 2 vCPU, 4 GB of memory), Podman rootless, systemd user
units written as quadlets, HTTPS by Caddy and Let's Encrypt. The site, its API and its database run on it; the
database is not reachable from outside, and of the API only its reads are, through Caddy ("The public API").

| Unit                  | What                                                       | Listens on                                  |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `vigie.network`       | internal network, containers reach each other by name      | –                                           |
| `vigie-db.container`  | PostgreSQL 18 with PostGIS, the accounts (`vigie-db-data`) | internal network only                       |
| `vigie-api.container` | the Vigie API (data volume `vigie-api-data`)               | internal network; `127.0.0.1:8081`          |
| `vigie-web.container` | this site                                                  | `127.0.0.1:3000` only                       |
| `caddy.container`     | the one door, host network (real visitor addresses)        | `80`, `443` (TCP and UDP); `127.0.0.1:8090` |
| `vigie-backup.timer`  | a dump of the database every day, kept 5 days              | –                                           |

`setup.sh` also sets the firewall (`nftables.conf`: SSH, HTTP and HTTPS only), SSH by key only, automatic
security updates, a journal kept 14 days at most, and 2 GB of swap for the image builds.

What is kept, and for how long, must match the privacy page: no access log (Caddy writes none), dumps of the
database 5 days, plus the host's own backup of the whole server (24 hours at its Standard level): a deleted
account is gone from every copy within 7 days, as the page says. A host backup that keeps copies 7 days (its
Premium level) would break that: shorten the dumps or change the page first.

## First install

From the repository, with the server's address and the SSH key given to the provider:

```
export VIGIE_HOST=<address> VIGIE_SSH_KEY=~/.ssh/<key>
deploy/vps/deploy.sh setup        # admin account (VIGIE_ADMIN_USER, default "debian"), sudo
deploy/vps/deploy.sh files
deploy/vps/deploy.sh secrets      # the database password, made on the server
<the FIRMS key> | deploy/vps/deploy.sh firms-key
<the admin token> | deploy/vps/deploy.sh admin-token
deploy/vps/deploy.sh api
deploy/vps/deploy.sh web
deploy/vps/deploy.sh caddy      # builds Caddy with the rate limit module, then starts it
```

Before `deploy.sh api`, set `VIGIE_CONTACT` in `~/vigie/api.env`: the contact sent to the providers, chosen by
the owner (the site's public address once the domain exists). MetService stays at the API's default, on (the
owner's decision for this instance).

## Check before going public

Caddy also serves the site on `127.0.0.1:8090`, for an SSH tunnel only:

```
ssh -L 8090:127.0.0.1:8090 vigie@<address>
```

then `http://localhost:8090`. `ORIGIN` is `http://localhost:8090` until the site is public, so the accounts
work through the tunnel too (a passkey accepts `localhost`): make an invitation and try the whole journey.

```
ssh vigie@<address> 'podman exec vigie-web node scripts/invite.mjs "note"'
```

## Going public

1. The legal notice of the about page is filled in.
2. The domain's DNS records point to the server: `A` (and `AAAA` if the server has IPv6).
3. `~/vigie/sites/public.caddy` from `public.caddy.example`, with the real name; `ORIGIN=https://<name>` in
   `~/vigie/web.env`; then `systemctl --user restart vigie-web caddy`. Caddy gets the certificate by itself.

## The public API

The API's reads are open to everybody at `https://<name>/v1/...` (the site's own domain; the site has no `/v1`
page): the snippet `(api)` of the `Caddyfile`, imported by `(site)`.

- Only `GET`, `HEAD` and `OPTIONS` go through, and the WebSocket `/v1/stream` (a `GET` with an upgrade; no read
  timeout, no buffer). Any other method gets 405 from Caddy; the API would answer 401 anyway without its admin
  token. The API's dashboard and docs stay internal.
- A rate limit per visitor address (an IPv6 `/64` counts as one): 300 requests a minute on `/v1`, and on
  `/v1/point`, the one route that costs calls to a provider, 10 a minute and 120 an hour. Over it: 429 with
  `Retry-After`. The module is not in the standard Caddy image: `caddy/Containerfile` builds one with xcaddy
  (`deploy.sh caddy`). Addresses exempt from it, for a load test only: `VIGIE_RATE_LIMIT_EXEMPT` in
  `~/vigie/caddy.env`, then `systemctl --user restart caddy`; remove them after.
- A `Cache-Control` on each answer that has none, from how often its data changes.
- The site itself does not go through it: it reads the API on the internal network, and its own limits apply.

To close the API again: remove `import api` from `(site)`, `deploy.sh files`.

## Update after a merge

`deploy.sh web` or `deploy.sh api` builds `origin/main` on the server, tags the image with the commit and
`:current`, and restarts the unit. To go back: `podman tag localhost/vigie-web:<previous sha>
localhost/vigie-web:current`, then `systemctl --user restart vigie-web`. Old images:
`podman images localhost/vigie-web`, `podman rmi localhost/vigie-web:<sha>`.

Caddy: `deploy.sh caddy` rebuilds it (a new Caddy version: the two `FROM` lines of `caddy/Containerfile`); the
previous image stays for a rollback, as above with `vigie-caddy` and `caddy`. The database image is pulled once; to take its fixes: `podman pull <image>`, then restart the unit.
PostgreSQL stays on 18: a new major version needs a dump, a new volume and a restore.

## Backups

`~/vigie/backups/vigie-<date>.dump`, made by `backup.sh` every day around 03:30 UTC
(`systemctl --user list-timers`). To restore one:

```
podman exec -i vigie-db pg_restore -U vigie -d vigie --clean --if-exists < ~/vigie/backups/<file>
```

The dumps are on the server's own disk: they protect against a mistake, not against the loss of the server.
