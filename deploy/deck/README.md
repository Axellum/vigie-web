# Running Vigie on a home server

What runs on the server (Podman, rootless, systemd user units written as quadlets):

| Unit                  | What                                                            | Listens on                                      |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `vigie.network`       | internal network, containers reach each other by name           | –                                               |
| `vigie-api.container` | the Vigie API (data volume `vigie-api-data`)                    | `8080` (home displays, Home Assistant)          |
| `vigie-web.container` | this site                                                       | `127.0.0.1:3000` only                           |
| `caddy.container`     | the one door to the site, host network (real visitor addresses) | `8090` (home network, HTTP); `8443` once public |

## First install

```
VIGIE_SERVER=user@host deploy/deck/deploy.sh files
# edit ~/vigie/web.env (ORIGIN) and ~/vigie/Caddyfile on the server
VIGIE_SERVER=user@host deploy/deck/deploy.sh api
VIGIE_SERVER=user@host deploy/deck/deploy.sh web
ssh user@host 'systemctl --user start caddy.service'
```

## Update after a merge

`deploy.sh web` or `deploy.sh api` builds `origin/main` on the server, tags the image with the commit and
`:current`, and restarts the unit. To go back: `podman tag localhost/vigie-web:<previous sha>
localhost/vigie-web:current`, then `systemctl --user restart vigie-web`.

## Going public

1. The router forwards its port 443 to the server's 8443.
2. Uncomment the public block of `~/vigie/Caddyfile` with the real name, set `ORIGIN=https://<name>` in
   `~/vigie/web.env`, restart `caddy` and `vigie-web`.
3. The legal notice of the about page is filled in before.
