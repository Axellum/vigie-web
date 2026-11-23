- The Android app can be linked to an account by a code, as a screen is, the other way round: the app shows a code
  (15 minutes, one use), the person enters it on the account page, part Notifications, and the phone receives the
  alerts of the account's zones (`/account/app/link`, `/account/app/account`). The app then keeps a secret of its
  own, stored as a SHA-256 on the server, to read the account's name and zones, send a test, change its token or
  unlink itself. Removing the phone from the account page unlinks it too.
