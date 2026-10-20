#!/usr/bin/env bash
# Builds one Vigie component on the home server from a git ref and restarts it (Podman, rootless quadlets).
#
#   VIGIE_SERVER=user@host deploy/deck/deploy.sh web [ref]     # this repository (default ref: origin/main)
#   VIGIE_SERVER=user@host deploy/deck/deploy.sh api [ref]     # the vigie-api repository (VIGIE_API_REPO)
#   VIGIE_SERVER=user@host deploy/deck/deploy.sh files         # quadlets, Caddyfile and health scripts only
#
# The image is tagged with the commit and with :current; the previous image stays for a rollback
# (podman tag localhost/vigie-web:<old sha> localhost/vigie-web:current, then restart).
set -euo pipefail

component=${1:?"web, api or files"}
ref=${2:-origin/main}
server=${VIGIE_SERVER:?"set VIGIE_SERVER=user@host"}
ssh_opts=(-o BatchMode=yes -o ServerAliveInterval=30)
[ -n "${VIGIE_SSH_KEY:-}" ] && ssh_opts+=(-i "$VIGIE_SSH_KEY")
here=$(cd "$(dirname "$0")" && pwd)

remote() { ssh "${ssh_opts[@]}" "$server" "$@"; }
copy() { scp -q "${ssh_opts[@]}" "$@"; }

install_files() {
	remote 'mkdir -p ~/.config/containers/systemd ~/vigie'
	copy "$here/vigie.network" "$here/vigie-api.container" "$here/vigie-web.container" "$here/caddy.container" \
		"$server:.config/containers/systemd/"
	copy "$here/api-healthcheck.py" "$here/web-healthcheck.mjs" "$server:vigie/"
	# Machine-specific files are created once from their examples and then left alone.
	copy "$here/Caddyfile.example" "$here/web.env.example" "$server:vigie/"
	remote 'cd ~/vigie && chmod 644 api-healthcheck.py web-healthcheck.mjs \
		&& { [ -f Caddyfile ] || cp Caddyfile.example Caddyfile; } \
		&& { [ -f web.env ] || cp web.env.example web.env; } \
		&& systemctl --user daemon-reload'
	echo "files installed"
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
		&& systemctl --user restart $image.service \
		&& sleep 10 && podman ps --filter name=$image --format '{{.Names}} {{.Image}} {{.Status}}'"
	echo "$image now runs $sha"
}

case $component in
files) install_files ;;
web) build "$(cd "$here/../.." && pwd)" vigie-web Containerfile ;;
api) build "${VIGIE_API_REPO:-$(cd "$here/../../../vigie_api" && pwd)}" vigie-api Dockerfile ;;
*)
	echo "unknown component: $component (web, api or files)" >&2
	exit 2
	;;
esac
