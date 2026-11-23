# Vigie for Android

A first, small native app that reads the public Vigie API, in French. Three tabs: the weather and the official warnings
of a place (home), a frise of the next 24 hours (hours), and the activity verdicts of the spots followed near it (sea).
The user chooses the places and their spots; two home screen widgets show one of them. It is not on any store.

- Kotlin and Jetpack Compose, one module (`app`), package `fr.auxfilsdesidees.vigie`.
- Minimum Android 7.0 (API 24), compiled and targeted for Android 17 (API 37).
- Data: `GET /v1/point`, `GET /v1/vigilances?lat&lon&lang=fr,en`, `GET /v1/activities/overview` and
  `GET /v1/activities/{spot}?days=3` (the first spot) of `https://vigie.auxfilsdesidees.fr`, and the site's place search
  `GET /data/places.json?q=` (GeoNames, CC BY 4.0, credited under the search). Nothing is sent but the search typed and the coordinates of the places; the choices stay
  on the phone (the app's private preferences); no account, no tracking. A place with a bell (below) is one
  exception: its name and point go to the site, with the phone's notification address. A phone linked to an account
  (below) is the other: the site keeps its notification address with the account.
- Places and spots: the first launch asks for a place (search, or the phone's approximate position rounded to about
  1 km, asked only when touched), then offers the nearest spots, those within 60 km ticked (three at most). Later, the
  gear of the home tab opens « Mes lieux et mes spots »: the followed places (touch one to show it, cross to stop
  following it, « Ajouter un lieu »), the spots of the shown place (the star puts one first: the frise draws it) and the
  nearest other spots. The home tab swipes between the places; the hours and sea tabs show the place shown last. The
  search puts the places of France first (the site ranks equal matches by population).
- Official warnings: those of the place's exact point (`/v1/vigilances`: an area that holds it, a river section within
  5 km; in France Météo-France and Vigicrues), never `local_alert_level` of `/v1/point` (a level Vigie works out over a
  wide radius, not a warning). Read and worded as the site's widget does (`src/lib/widget/model.ts`, `text.ts`), so the
  family says the same thing: a banner on the home tab (the highest level, its phenomena, until when, « +1 » for the
  others; « Aucune vigilance en cours » otherwise), touched to open every warning with its period, its area and the
  issuer's bulletin; a « Vigil. » row in the frise draws each warning over its hours (a river in flood has none: the
  banner says it). The end shown is `ends_utc`, else `expires_utc` (the end of the bulletin), as on the widget.
- The hours tab: for today, the 24 hours from now; for the next two days, from 6 h. Rows: sky, temperature, rain and
  wind from `hourly` of `/v1/point` (ADR 0040 of the API; when it is missing, the tab says so and shows the rest), the
  official warnings of the place, then the tide, the coastal warning (« Côte ») and three activities of the first spot. Touch or drag it: the reading under it
  follows the finger. Night hours are shaded and show no verdict.
- Offline: the last good read of every followed place is kept on the phone (the texts the API served, the overview cut
  down to the place's spots, in the app's folder that the phone's backup leaves out). It shows at once at the next
  launch while the network answers, and stays when it does not, with when it was read, on the three tabs: « Données
  d'hier 18 h 05 · Pas de réponse du serveur… ». A failed or unreadable read never replaces it; a place no longer followed loses its copy.
  The screen then reads as of that time (the frise, the days, the warnings); the rain of the hour to come, past 30
  minutes, reads « non lue ».
- The home screen widget « Vigie · mon lieu » (Glance): its place is chosen among the followed places when it is
  placed (« Paramètres » of the widget changes it). It says what the site's widget says (`/widget`, same blocks, same
  words), in three sizes picked from the room the home screen gives it: small (temperature, rain of the hour, the
  warning's level), medium (the sky, the warnings, the rain of the hour with its bars, the wind) and large (the same,
  then five days). Touched, it opens the app on its place. It reads only the copies the app keeps: every half hour
  (WorkManager), and at once when it is placed, the places shown by a widget are read again when their copy is older
  than a quarter of an hour; without network it shows its copy with its age, the rain of the hour then « non lue ». The
  app redraws it after each read it keeps. From Android 15, the widget list shows it drawn by the same code from
  made-up values (« Mon lieu »).
- The widget « Vigie · la frise »: the hours tab in small. A header (the place, its sky and temperature, the warnings
  in a few words), then the next 14 hours drawn into a picture (a home screen cannot draw a curve): night shade, sky
  every two hours, temperature, wind and its strongest gust, rain bars, « Maint. » under the line of now. With three
  rows or more, the tide (high and low waters written) and the surf of the favourite spot, hour by hour, come under
  it. Same choice of place, refresh, age and touch as « Vigie · mon lieu ».
- Notifications, without an account: in « Mes lieux et mes spots », each place has a bell (« dès le jaune », « orange
  et rouge », « rouge seulement », « jamais »). The first bell asks Android's permission (Android 13 and later), then
  the phone registers with the site (`/account/app/device`, see the site's `docs/configuration.md`) with its Firebase
  Cloud Messaging token, and gets a secret it keeps in its private preferences. Each change sends every place with a
  bell (its name, its point, a circle of 10 km, the lowest level); no bell left makes the site forget the phone. The
  site sends a warning that touches a place once, red ones in their own category; touched, the notification opens the
  warnings of that place. A failed sync is tried again in the background (WorkManager), and the places are sent again
  once a day while a bell is on (the site forgets a phone it has not heard of for 60 days). The part « Notifications »
  of the same page says what the site keeps, sends a test and opens Android's settings of the app's notifications
  (sound, vibration, each category).
- Linked to an account: the part « Compte Vigie » of the same page links the app to an account of the site, so the
  phone also gets the alerts of the account's zones. « Relier à mon compte » asks the permission, then a code
  (`/account/app/link` with the Firebase token, see the site's `docs/configuration.md`) and shows it; the person enters
  it on the account page, part Notifications, from any device, or « Ouvrir la page du compte » opens
  `/account#link=CODE`, which fills it in. While the code is shown and the page is on screen, the app asks every 3
  seconds whether it was entered, and picks up its own secret once it is. Then the part shows the account's name, its
  zones and their lowest level, the quiet hours, a test and « Délier ». The account is read again when the page opens;
  a phone removed on the account page shows unlinked. A new Firebase token is given to the site in the background
  (WorkManager).
- Colours and words follow the visual charter shared by the Vigie tools (sky gradient, dark glass cards, one colour per
  meaning, a word always next to a colour).

## Build

Needs a JDK 17 or newer and the Android SDK (platform `android-37.0`, build tools 36). Point Gradle at the SDK with a
`local.properties` file (not committed):

```properties
sdk.dir=/path/to/android/sdk
```

Then, from this folder:

```sh
./gradlew testDebugUnitTest   # unit tests (no network: they read trimmed real answers in app/src/test/resources)
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On Windows, `gradlew.bat` instead of `./gradlew`.

### Notifications need a Firebase config

The notifications go through a Firebase project, whose config file (`google-services.json`) is not in the repository.
Name its path in `local.properties` (`vigie.firebase.config=/path/to/google-services.json`) or in the environment
(`VIGIE_FIREBASE_CONFIG`); the build turns its values into string resources. Without it (the CI's builds), the app
builds and runs the same, without any bell.

A debug build can send its bells to a site run on the computer (here on port 4174, with accounts and Firebase sending
turned on, see the site's `docs/configuration.md`):

```sh
adb reverse tcp:4174 tcp:4174
adb shell am start -S -n fr.auxfilsdesidees.vigie/.MainActivity --es vigie_site_url http://127.0.0.1:4174
```

The bells and the account link go there until the next start without the extra. `--ez vigie_debug_token true` asks the permission and
writes the phone's token in the log (tag `VigieNotify`), to send it a message by hand.

### Trying an API that is not deployed

A debug build can read a Vigie API run on the computer, through the USB cable (a release build ignores this):

```sh
adb reverse tcp:8080 tcp:8080
adb shell am start -S -n fr.auxfilsdesidees.vigie/.MainActivity --es vigie_base_url http://127.0.0.1:8080
```

Only the loopback address is accepted, and plain HTTP is allowed for it in the debug build alone
(`app/src/debug/res/xml/network_security_config.xml`). The place search still asks the public site (an API alone does
not serve it).

## Layout

| File | Role |
|---|---|
| `data/VigieRepository.kt` | the requests of a place's refresh, run together; the spot catalogue; the place search |
| `data/VigieParser.kt` | JSON to models; an unknown field is ignored, a missing one stays null |
| `data/PlacesStore.kt` | the followed places and their spots, and every change to them (tested on the JVM) |
| `data/OfflineCopies.kt` | the last good read of each place, kept on the phone for the launch and the offline (tested on the JVM) |
| `data/Geo.kt` | distances, the nearest spots, the rounding of a position (tested on the JVM) |
| `data/AppData.kt` | the places, the copies and the API client, shared by the app and the widget |
| `widget/WidgetModel.kt` | what the widget shows, read from a place's copy as the site's widget reads it (tested on the JVM) |
| `widget/PlaceWidget.kt` | the widget drawn in its three sizes (Glance), and its preview in the widget list; the frame both widgets share |
| `widget/FriseModel.kt` | the hours of the frise widget, read as the hours tab reads them (tested on the JVM) |
| `widget/FriseArt.kt` | the frise drawn into a picture: weather, then the tide and the surf when there is room |
| `widget/FriseWidget.kt` | the frise widget: its header and its picture (Glance) |
| `widget/WidgetArt.kt` | the sky and the wind arrow drawn to pictures, which a home screen can show |
| `widget/WidgetRefresh.kt` | the half-hourly read and the redraw of the widgets; their receivers |
| `widget/WidgetConfigActivity.kt` | the choice of the widget's place, when it is placed or reconfigured |
| `ui/HomeViewModel.kt` | the app's state: choices saved at each change, each place read on its own |
| `ui/FirstLaunch.kt` | the two steps of the first launch: the place, then its spots |
| `ui/PlacesScreen.kt` | « Mes lieux et mes spots », and the place search shared with the first launch |
| `ui/BellsSection.kt` | the bell of each place, its four choices, and the part « Notifications » of that page |
| `notify/Bells.kt` | what the site is told about the bells, the requests, the sync; the place a notification names (tested on the JVM) |
| `notify/BellWork.kt` | the sync run by the page, again in the background when it failed, and once a day |
| `ui/AccountSection.kt` | the part « Compte Vigie »: the code, the account's name and zones, a test, « Délier » |
| `ui/AccountViewModel.kt` | the link seen from that part: one talk with the site at a time, what to say after each action |
| `notify/AccountLink.kt` | the link to an account: the requests, the code, the secret and the last account kept (tested on the JVM) |
| `notify/AccountWork.kt` | the link over the app's preferences; a new token given to the site in the background |
| `notify/VigieNotifications.kt` | the two categories, the Firebase token, a message shown while the app is open |
| `notify/VigieMessagingService.kt` | the messages and the new tokens of Firebase Cloud Messaging |
| `ui/Locator.kt` | the phone's approximate position, from the system's own providers |
| `ui/Words.kt` | the French words: weather, wind, verdicts, reasons, times, sentences (tested on the JVM) |
| `ui/Vigil.kt` | the official warnings read and worded as the site's widget: banner, periods, frise lanes (tested on the JVM) |
| `ui/WarningsScreen.kt` | the banner of the home tab and the page of the warnings of a place, with the bulletins |
| `ui/Frise.kt` | the frise's days and hours, tide between extremes (tested on the JVM) |
| `ui/HoursTab.kt` | the hours tab: day pills, the frise drawn on a canvas, the reading of an hour |
| `ui/Drawing.kt` | weather icons, wind arrow, activity glyphs, monotone curve |
| `ui/VigieApp.kt` | the tabs, the pages of the home tab and their cards |
| `ui/theme/` | the charter's « Ciel » colours and type scale |
