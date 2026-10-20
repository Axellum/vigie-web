# Running Vigie on a rented server

The public instance: a small rented server (Debian 13, 2 vCPU, 4 GB of memory), Podman rootless, systemd user
units written as quadlets, HTTPS by Caddy and Let's Encrypt. The site, its API and its database run on it; the
API and the database are not reachable from outside.

| Unit                  | What                                                       | Listens on                                  |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| `vigie.network`       | internal network, containers reach each other by name      | –                                           |
| `vigie-db.container`  | PostgreSQL 18 with PostGIS, the accounts (`vigie-db-data`) | internal network only                       |
| `vigie-api.container` | the Vigie API (data volume `vigie-api-data`)               | internal network only                       |
| `vigie-web.container` | this site                                                  | `127.0.0.1:3000` only                       |
| `caddy.container`     | the one door, host network (real visitor addresses)        | `80`, `443` (TCP and UDP); `127.0.0.1:8090` |
| `vigie-backup.timer`  | a dump of the database every day, kept 6 days              | –                                           |

`setup.sh` also sets the firewall (`nftables.conf`: SSH, HTTP and HTTPS only), SSH by key only, automatic
security updates, a journal kept 14 days at most, and 2 GB of swap for the image builds.

What is kept, and for how long, must match the privacy page: no access log (Caddy writes none), dumps of the
database 6 days (the page says 7 days at most). A backup option of the host that keeps copies longer would
change that: check its retention before turning it on.

## First install

From the repository, with the server's address and the SSH key given to the provider:

```
export VIGIE_HOST=<address> VIGIE_SSH_KEY=~/.ssh/<key>
deploy/vps/deploy.sh setup        # admin account (VIGIE_ADMIN_USER, default "debian"), sudo
deploy/vps/deploy.sh files
deploy/vps/deploy.sh secrets      # the database password, made on the server
<the FIRMS key> | deploy/vps/deploy.sh firms-key
deploy/vps/deploy.sh api
deploy/vps/deploy.sh web
ssh vigie@<address> 'systemctl --user start caddy.service'
```

Check `~/vigie/api.env` (the contact sent to the providers) before `deploy.sh api`.

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

## Update after a merge

`deploy.sh web` or `deploy.sh api` builds `origin/main` on the server, tags the image with the commit and
`:current`, and restarts the unit. To go back: `podman tag localhost/vigie-web:<previous sha>
localhost/vigie-web:current`, then `systemctl --user restart vigie-web`. Old images:
`podman images localhost/vigie-web`, `podman rmi localhost/vigie-web:<sha>`.

The database and Caddy images are pulled once; to take their fixes: `podman pull <image>`, then restart the unit.
PostgreSQL stays on 18: a new major version needs a dump, a new volume and a restore.

## Backups

`~/vigie/backups/vigie-<date>.dump`, made by `backup.sh` every day around 03:30 UTC
(`systemctl --user list-timers`). To restore one:

```
podman exec -i vigie-db pg_restore -U vigie -d vigie --clean --if-exists < ~/vigie/backups/<file>
```

The dumps are on the server's own disk: they protect against a mistake, not against the loss of the server.
