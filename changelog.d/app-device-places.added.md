- The bells of the Android app, server side: a phone can follow the alerts of its own places without an account
  (`/account/app/device`, a secret kept as a SHA-256, at most 10 places rounded to about 1 km). Its places are
  compared with the alerts in force like the zones of an account and told through Firebase Cloud Messaging
  (the notification's text is the place's name); turning every bell off forgets the phone, and a phone silent for 60 days is forgotten. New setting
  `VIGIE_MAX_APP_DEVICES`; the privacy page and the records of processing say what is kept.
