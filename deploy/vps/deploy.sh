#!/usr/bin/env bash
# Installs and updates Vigie on a rented server (Debian 13, Podman rootless quadlets). See README.md.
#
#   VIGIE_HOST=<address> deploy/vps/deploy.sh setup           # once: system, user "vigie", firewall (admin account, sudo)
#   VIGIE_HOST=<address> deploy/vps/deploy.sh files           # quadlets, Caddyfile, backup timer, health scripts
#   VIGIE_HOST=<address> deploy/vps/deploy.sh secrets         # once: the database password, made on the server
#   <key> | VIGIE_HOST=<address> deploy/vps/deploy.sh firms-key   # the NASA FIRMS key, read on stdin
#   <token> | VIGIE_HOST=<address> deploy/vps/deploy.sh admin-token  # the API's admin token, read on stdin
#   VIGIE_HOST=<address> deploy/vps/deploy.sh api [ref]       # the vigie-api repository (VIGIE_API_REPO), origin/main
#   VIGIE_HOST=<address> deploy/vps/deploy.sh web [ref]       # this repository, origin/main
#
# VIGIE_ADMIN_USER is the provider's admin account (default "debian"), VIGIE_SSH_KEY the private key to use.
# Images are tagged with the commit and with :current; the previous one stays for a rollback.
set -euo pipefail

component=${1:?"setup, files, secrets, firms-key, admin-token, api or web"}
ref=${2:-origin/main}
host=${VIGIE_HOST:?"set VIGIE_HOST to the server's address"}
server=vigie@$host
ssh_opts=(-o BatchMode=yes -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new)
[ -n "${VIGIE_SSH_KEY:-}" ] && ssh_opts+=(-i "$VIGIE_SSH_KEY")
here=$(cd "$(dirname "$0")" && pwd)
shared=$here/../deck

remote() { ssh "${ssh_opts[@]}" "$server" "$@"; }
copy() { scp -q "${ssh_opts[@]}" "$@"; }

setup() {
	local admin=${VIGIE_ADMIN_USER:-debian}@$host
	ssh "${ssh_opts[@]}" "$admin" 'rm -rf /tmp/vigie-setup && mkdir -m 700 /tmp/vigie-setup'
	scp -q "${ssh_opts[@]}" "$here/setup.sh" "$here/nftables.conf" "$admin:/tmp/vigie-setup/"
	ssh "${ssh_opts[@]}" "$admin" 'sudo bash /tmp/vigie-setup/setup.sh /tmp/vigie-setup; status=$?; rm -rf /tmp/vigie-setup; exit $status'
}

install_files() {
	remote 'mkdir -p ~/.config/containers/systemd ~/.config/systemd/user ~/vigie/sites'
	copy "$shared/vigie.network" "$here/vigie-db.container" "$here/vigie-api.container" "$here/vigie-web.container" \
		"$here/caddy.container" "$server:.config/containers/systemd/"
	copy "$here/vigie-backup.service" "$here/vigie-backup.timer" "$server:.config/systemd/user/"
	copy "$shared/api-healthcheck.py" "$shared/web-healthcheck.mjs" "$here/backup.sh" "$here/Caddyfile" \
		"$here/public.caddy.example" "$here/web.env.example" "$here/api.env.example" "$server:vigie/"
	# Machine-specific files (web.env, api.env, sites/public.caddy) are created once and then left alone.
	remote 'cd ~/vigie && chmod 644 api-healthcheck.py web-healthcheck.mjs Caddyfile && chmod 755 backup.sh \
		&& { [ -f web.env ] || cp web.env.example web.env; } \
		&& { [ -f api.env ] || cp api.env.example api.env; } \
		&& systemctl --user daemon-reload \
		&& systemctl --user enable -q --now vigie-backup.timer \
		&& systemctl --user try-restart caddy.service'
	echo "files installed"
}

# The database password is made on the server and never leaves it. It is set once: the volume keeps the first one.
secrets() {
	remote 'if podman secret exists vigie_db_password; then echo "database secrets already there"; else
		pw=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d " \n")
		printf %s "$pw" | podman secret create vigie_db_password - >/dev/null
		printf %s "postgres://vigie:$pw@vigie-db:5432/vigie" | podman secret create --replace vigie_database_url - >/dev/null
		echo "database secrets created"; fi'
}

# A secret of the API, read on stdin (never on the command line), then the API restarts if it runs.
api_secret() {
	local name=$1 value
	value=$(tr -d '\r\n')
	if [ -z "$value" ]; then
		echo "nothing on stdin" >&2
		exit 2
	fi
	printf %s "$value" | remote "podman secret create --replace $name - >/dev/null \
		&& systemctl --user try-restart vigie-api.service && echo '$name stored'"
}

build() {
	local repo=$1 image=$2 file=$3
	git -C "$repo" fetch -q origin
	local sha
	sha=$(git -C "$repo" rev-parse --short=7 "$ref")
	local tmp
	tmp=$(mktemp -d)
	git -C "$repo" archive --format=tar.gz -o "$tmp/src.tar.gz" "$ref"
	remote "rm -rf ~/vigie/build/$image && mkdir -p ~/vigie/build/$image"
	copy "$tmp/src.tar.gz" "$server:vigie/build/$image.tar.gz"
	rm -rf "$tmp"
	remote "set -e; cd ~/vigie/build/$image && tar -xzf ../$image.tar.gz \
		&& podman build -q --label org.opencontainers.image.revision=$sha -t localhost/$image:$sha -f $file . \
		&& podman tag localhost/$image:$sha localhost/$image:current \
		&& podman image prune -f >/dev/null \
		&& systemctl --user restart $image.service \
		&& sleep 10 && podman ps --filter name=$image --format '{{.Names}} {{.Image}} {{.Status}}'"
	echo "$image now runs $sha"
}

case $component in
setup) setup ;;
files) install_files ;;
secrets) secrets ;;
firms-key) api_secret vigie_firms_map_key ;;
admin-token) api_secret vigie_admin_token ;;
web) build "$(cd "$here/../.." && pwd)" vigie-web Containerfile ;;
api) build "${VIGIE_API_REPO:-$(cd "$here/../../../vigie_api" && pwd)}" vigie-api Dockerfile ;;
*)
	echo "unknown component: $component (setup, files, secrets, firms-key, admin-token, api or web)" >&2
	exit 2
	;;
esac
