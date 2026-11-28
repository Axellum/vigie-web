# Running Vigie on a rented server

The public instance: a rented server (Debian or Ubuntu, amd64 or arm64), Podman rootless, systemd user units written
as quadlets, HTTPS by Caddy and Let's Encrypt. The site, its API and its database run on it; the database is not
reachable from outside, and of the API only its reads are, through Caddy ("The public API"). Since November 2026 it
runs on an arm64 server of Oracle Cloud in Marseille, France, that also runs other services ("On a host that is
already managed"); before, on a server of its own at OVHcloud.

| Unit                  | What                                                       | Listens on                                  |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `vigie.network`       | internal network, containers reach each other by name      | –                                           |
| `vigie-db.container`  | PostgreSQL 18 with PostGIS, the accounts (`vigie-db-data`) | internal network only                       |
| `vigie-api.container` | the Vigie API (data volume `vigie-api-data`)               | internal network; `127.0.0.1:8082`          |
| `vigie-web.container` | this site                                                  | `127.0.0.1:3000` only                       |
| `caddy.container`     | the one door, host network (real visitor addresses)        | `80`, `443` (TCP and UDP); `127.0.0.1:8090` |
| `vigie-backup.timer`  | a dump of the database every day, kept 5 days              | –                                           |

`setup.sh` also sets the firewall (`nftables.conf`: SSH, HTTP, HTTPS, and UDP 51820 for WireGuard, a private link to a
helper server whose peer and keys are set by hand in `/etc/wireguard` and never kept in this repository), SSH by key only with fail2ban
(an address that fails 5 times in 10 minutes is banned an hour, longer each time it comes back), automatic security
updates with a reboot at 04:45 UTC when one needs it (a kernel fix only protects after a reboot; the site is down
about a minute), a journal kept 14 days at most, and 2 GB of swap for the image builds.

What is kept, and for how long, must match the privacy page: no access log (Caddy writes none), dumps of the
database 5 days, plus the host's own backups of the server's disk, kept 2 days at most: a deleted account is gone
from every copy within 7 days, as the page says. A host backup kept longer would break that: shorten the dumps or
change the page first.

## First install

From the repository, with the server's address and the SSH key given to the provider:

```
export VIGIE_HOST=<address> VIGIE_SSH_KEY=~/.ssh/<key>
deploy/vps/deploy.sh setup        # admin account (VIGIE_ADMIN_USER, default "debian"), sudo
deploy/vps/deploy.sh files
deploy/vps/deploy.sh secrets      # the database password, made on the server
deploy/vps/deploy.sh db           # builds PostgreSQL with PostGIS for the server's architecture, then starts it
<the FIRMS key> | deploy/vps/deploy.sh firms-key
<the admin token> | deploy/vps/deploy.sh admin-token
deploy/vps/deploy.sh api
deploy/vps/deploy.sh web
deploy/vps/deploy.sh caddy      # builds Caddy with the rate limit module, then starts it
```

Before `deploy.sh api`, set `VIGIE_CONTACT` in `~/vigie/api.env`: the contact sent to the providers, chosen by
the owner (the site's public address once the domain exists). MetService stays at the API's default, on (the
owner's decision for this instance).

## On a host that is already managed

A server that already runs other services (Docker containers, for one) keeps its own firewall, SSH settings, updates
and swap. There, `VIGIE_HOST_MANAGED=1 deploy/vps/deploy.sh setup` only installs Podman, makes the user `vigie` (not in
the `docker` group: the public site cannot drive the other containers), turns linger on and lets users listen from
port 80. Never run `setup` without it on such a host: `nftables.conf` replaces the whole ruleset, Docker's rules with
it.

- Let TCP 80 and 443 and UDP 443 (HTTP/3) in, in the provider's network rules and in the host's own firewall, ahead of
  its final reject. Rootless containers do not go through Docker's chains: Caddy listens on the host itself.
- The API reaches services of the host as `host.containers.internal` (a port Docker publishes is reachable there).
  Neither `127.0.0.1` nor the host's own address works: pasta gives the container the host's address.
- The units take `127.0.0.1:3000`, `127.0.0.1:8082` and `127.0.0.1:8090` and Caddy `80` and `443` on the host: check
  they are free (`ss -ltnu`).
- The host's backups of its disk hold the accounts' database too: keep them 2 days at most (a daily backup kept 2
  days), so that a deleted account is gone from every copy within 7 days.
- From another server, move the data with the services stopped: `pg_dump --format=custom` of the old `vigie-db`, then
  `pg_restore` into the new one (`deploy.sh db` first; a volume of one architecture is not read by the other). A dump
  of the old `postgis/postgis` image holds its tiger geocoder, which the site does not use and the new image does not
  install: leave it out (`pg_restore -l old.dump | grep -vE ' tiger |postgis_tiger_geocoder' >keep.list`, then
  `pg_restore -L keep.list --exit-on-error -U vigie -d vigie old.dump`). The
  API's archive as in "Off-site copy" below; the Caddy volume `vigie-caddy-data` (`podman volume export` and `import`)
  keeps the certificates, so HTTPS works before the DNS records move.

## Connections from the containers

The containers reach the Internet through a network Podman makes for them, then pasta. That network forgets, after 60
seconds, a connection whose far end has closed it; the API closes its own side of an idle kept connection only at its
next request to that source, and that late close is then dropped, so pasta keeps the connection for good and any later
connection from the same source port gets no answer. Measured on the server: about 250 such connections an hour, and 1
to 2 % of new connections to the busiest sources lost four hours after a restart. `vigie-api.container` sets that
delay to a day at each start of the API (`ExecStartPost`). Check it, and count the connections pasta keeps:

```sh
podman unshare --rootless-netns cat /proc/sys/net/netfilter/nf_conntrack_tcp_timeout_close_wait   # 86400
ss -tanpH state close-wait | grep -c pasta
```

A newer pasta does not change this: the close never reaches it.

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

## Notifications of the Android app (optional)

The app's notifications go through Firebase Cloud Messaging, with the JSON key of a Firebase service account allowed
to send only (see the site's `docs/configuration.md`). Without it, the site runs the same and sends nothing to the
app (its routes `/account/app/...` answer 404).

```
deploy/vps/deploy.sh fcm-key < <the service account's JSON file>
```

It stores the key as the Podman secret `vigie_fcm_service_account`, writes the drop-in
`~/.config/containers/systemd/vigie-web.container.d/fcm.conf` that mounts it as a file and sets
`VIGIE_FCM_SERVICE_ACCOUNT`, then restarts the site. Run it again with a new key to replace it. To turn it off: remove
`fcm.conf`, `systemctl --user daemon-reload`, `systemctl --user restart vigie-web`, then
`podman secret rm vigie_fcm_service_account`.

## The public API

The API's reads are open to everybody at `https://<name>/v1/...` (the site's own domain; the site has no `/v1`
page): the snippet `(api)` of the `Caddyfile`, imported by `(site)`.

- Only `GET`, `HEAD` and `OPTIONS` go through, and the WebSocket `/v1/stream` (a `GET` with an upgrade; no read
  timeout, no buffer). Any other method gets 405 from Caddy; the API would answer 401 anyway without its admin
  token. The API's dashboard and docs stay internal.
- A rate limit per visitor address (an IPv6 `/64` counts as one): 300 requests a minute on `/v1`, and on
  `/v1/point`, the one route that costs calls to a provider, 10 a minute and 120 an hour; on `/v1/points`, which
  reads up to 40 places at once, 3 a minute and 30 an hour. Over it: 429 with `Retry-After`. The module is not in the standard Caddy image: `caddy/Containerfile` builds one with xcaddy
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

One deploy at a time: every command but `setup` holds `~/vigie/deploy.lock` on the server while it runs, and stops
(exit 3, saying what holds it since when) if another one does. A deploy killed hard leaves the lock behind: once sure
that none runs, `rm -rf ~/vigie/deploy.lock`.

Caddy: `deploy.sh caddy` rebuilds it (a new Caddy version: the two `FROM` lines of `caddy/Containerfile`); the
previous image stays for a rollback, as above with `vigie-caddy` and `caddy`. The database: `deploy.sh db` builds it
again on the newest PostgreSQL 18 image and PostGIS package (their fixes), then restarts it; the previous image stays,
as above with `vigie-db`. PostgreSQL stays on 18: a new major version needs a dump, a new volume and a restore.

## Backups

`~/vigie/backups/vigie-<date>.dump`, made by `backup.sh` every day around 03:30, the server's time
(`systemctl --user list-timers`). To restore one:

```
podman exec -i vigie-db pg_restore -U vigie -d vigie --clean --if-exists < ~/vigie/backups/<file>
```

The dumps are on the server's own disk: they protect against a mistake, not against the loss of the server.

### Off-site copy of the API's database

The API's database (`/data/vigie.db` in the volume `vigie-api-data`: the archive of the warnings, the forecasts kept
to measure them, the sources' history) took weeks to gather and holds no account and no visitor's data. A backup job
(of this server or of another one) pulls a copy of it every night with its own SSH key, limited to one command by a
line of `/home/vigie/.ssh/authorized_keys`, and sends it to storage off the server:

```
restrict,command="/home/vigie/vigie/export-oracle.sh" ssh-ed25519 AAAA... oracle-sauvegardes
```

`export-oracle.sh` writes to its output a consistent copy of the database (SQLite's backup API, safe while the API
writes), compressed with zstd. Whatever the key asks for, only this runs, and `restrict` turns off forwarding and the
terminal. The backup job checks each copy (`zstd -t`, `PRAGMA integrity_check`, an archive that is not empty) and
keeps them 14 days.

- The accounts' database is not copied there: its dumps stay on this server, so that a deleted account is still
  gone from every copy within 7 days.
- `setup.sh` writes the admin account's keys over `authorized_keys` of `vigie`: after running it again, add this
  line back.
- To restore a copy (not tried yet): `zstd -d vigie-api-<date>.db.zst -o vigie.db`, put `vigie.db` on this server,
  then

```
systemctl --user stop vigie-api
podman run --rm -i -v vigie-api-data:/data --entrypoint sh localhost/vigie-api:current -c \
  'cat >/data/vigie.db.new && rm -f /data/vigie.db-wal /data/vigie.db-shm && mv /data/vigie.db.new /data/vigie.db' <vigie.db
systemctl --user start vigie-api
```
