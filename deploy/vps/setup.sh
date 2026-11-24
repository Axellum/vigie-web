#!/usr/bin/env bash
# Prepares a fresh Debian 13 server for Vigie, as root (deploy.sh setup runs it with sudo from the admin account).
#   - the user "vigie" (no sudo) runs the containers, with the admin account's SSH keys;
#   - Podman (rootless); ports 80 and 443 allowed to unprivileged users; the user's units start at boot;
#   - firewall: only SSH, HTTP, HTTPS and WireGuard come in (nftables.conf);
#   - SSH by key only, fail2ban on SSH, security updates installed automatically (with a reboot at 04:45 UTC when one
#     needs it), the journal kept 14 days at most.
# With VIGIE_HOST_MANAGED=1 (a host that already runs other services, Docker for one, and keeps its own firewall, SSH
# settings, updates and swap; Debian or Ubuntu), only the first three: nftables.conf would replace the host's whole
# ruleset, Docker's rules with it, and the rest would overwrite its own settings. Its firewall must then let TCP 80 and
# 443 and UDP 443 in (README.md, "On a host that is already managed").
# Running it again changes nothing that is already in place.
set -euo pipefail

here=${1:?"directory of setup.sh and nftables.conf"}
admin=${SUDO_USER:?"run it with sudo from the admin account"}
managed=${VIGIE_HOST_MANAGED:-0}
admin_keys=$(getent passwd "$admin" | cut -d: -f6)/.ssh/authorized_keys
if [ ! -s "$admin_keys" ]; then
	echo "no SSH key for $admin: add one before passwords are turned off" >&2
	exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
if [ "$managed" = 1 ]; then
	apt-get install -y -q podman passt uidmap dbus-user-session zstd
else
	apt-get install -y -q podman passt uidmap dbus-user-session nftables unattended-upgrades zstd fail2ban wireguard-tools
fi

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

if [ "$managed" = 1 ]; then
	echo "setup done (managed host: firewall, SSH, updates, journal and swap left as they are): $(podman --version)," \
		"linger $(loginctl show-user vigie -p Linger --value)"
	exit 0
fi

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

# An installed kernel fix only protects after a reboot: reboot when an update needs it, at 04:45 UTC, after the dump of
# the database (vigie-backup.timer, 03:30 UTC plus up to 15 minutes). The containers start again by themselves (linger).
cat >/etc/apt/apt.conf.d/52automatic-reboot <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:45";
EOF

# SSH is open to the whole Internet: ban an address after 5 failures in 10 minutes, 1 hour, longer each time it comes
# back (up to a week). Debian 13 (OpenSSH 10) logs the failures as sshd-session, which defaults-debian.conf does not
# read. To never ban an address of yours, add it to ignoreip in /etc/fail2ban/jail.local.
cat >/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1
bantime = 1h
bantime.increment = true
bantime.maxtime = 1w
findtime = 10m
maxretry = 5

[sshd]
enabled = true
backend = systemd
journalmatch = _SYSTEMD_UNIT=ssh.service + _COMM=sshd + _COMM=sshd-session
mode = aggressive
EOF
systemctl enable -q fail2ban
systemctl restart fail2ban

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
