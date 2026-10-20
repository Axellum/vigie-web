#!/usr/bin/env bash
# Prepares a fresh Debian 13 server for Vigie, as root (deploy.sh setup runs it with sudo from the admin account).
#   - the user "vigie" (no sudo) runs the containers, with the admin account's SSH keys;
#   - Podman (rootless); ports 80 and 443 allowed to unprivileged users; the user's units start at boot;
#   - firewall: only SSH, HTTP and HTTPS come in (nftables.conf);
#   - SSH by key only, security updates installed automatically, the journal kept 14 days at most.
# Running it again changes nothing that is already in place.
set -euo pipefail

here=${1:?"directory of setup.sh and nftables.conf"}
admin=${SUDO_USER:?"run it with sudo from the admin account"}
admin_keys=$(getent passwd "$admin" | cut -d: -f6)/.ssh/authorized_keys
if [ ! -s "$admin_keys" ]; then
	echo "no SSH key for $admin: add one before passwords are turned off" >&2
	exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q podman passt uidmap dbus-user-session nftables unattended-upgrades

# The account that runs the containers, reachable with the same keys as the admin account.
if ! id vigie >/dev/null 2>&1; then
	useradd --create-home --shell /bin/bash --comment Vigie vigie
fi
if ! grep -q '^vigie:' /etc/subuid; then
	start=$(awk -F: '{ end = $2 + $3; if (end > top) top = end } END { print (top > 100000 ? top : 100000) }' /etc/subuid)
	usermod --add-subuids "$start-$((start + 65535))" --add-subgids "$start-$((start + 65535))" vigie
fi
install -d -m 700 -o vigie -g vigie /home/vigie/.ssh
install -m 600 -o vigie -g vigie "$admin_keys" /home/vigie/.ssh/authorized_keys
loginctl enable-linger vigie

# Caddy runs rootless and listens on 80 and 443 (this setting covers IPv4 and IPv6).
echo 'net.ipv4.ip_unprivileged_port_start=80' >/etc/sysctl.d/60-vigie.conf
sysctl -q -p /etc/sysctl.d/60-vigie.conf

install -m 755 "$here/nftables.conf" /etc/nftables.conf
systemctl enable -q nftables
systemctl restart nftables

# Key only. The first value read wins and the provider's image may set its own in 50-cloud-init.conf: 01 comes first.
cat >/etc/ssh/sshd_config.d/01-vigie.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# The journal holds the logs of the containers too: 14 days at most (13 days, plus one file of one day).
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/60-vigie.conf <<'EOF'
[Journal]
MaxRetentionSec=13day
MaxFileSec=1day
SystemMaxUse=1G
EOF
systemctl restart systemd-journald

# Some room for the image builds (npm ci, vite) next to the running containers.
if [ -z "$(swapon --show --noheadings)" ]; then
	fallocate -l 2G /swapfile
	chmod 600 /swapfile
	mkswap -q /swapfile
	swapon /swapfile
	grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "setup done: $(podman --version), firewall $(nft list chain inet filter input | grep -c accept) accept rules," \
	"ssh password $(sshd -T | awk '/^passwordauthentication/ { print $2 }'), linger $(loginctl show-user vigie -p Linger --value)"
