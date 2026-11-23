- `deploy/vps/deploy.sh fcm-key` stores the Firebase service account (read on stdin) as a Podman secret and mounts it
  in the site through a drop-in of `vigie-web.container`, so a server without Firebase needs neither.
