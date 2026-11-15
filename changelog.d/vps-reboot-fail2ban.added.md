- The rented server reboots by itself at 04:45 UTC when a security update needs it (a kernel fix only protects after a
  reboot), and fail2ban bans the addresses that keep failing to log in over SSH (`deploy/vps/setup.sh`).
