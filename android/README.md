# Vigie for Android

A first, small native app that reads the public Vigie API, in French. Four tabs: the weather and the official warnings
of a place (Accueil, and its Détails), a frise of the next 24 hours (Heures), and the beaches of the spots followed near
it (Mer).
The user chooses the places and their spots; two home screen widgets show one of them. It is not on any store.

- Kotlin and Jetpack Compose, one module (`app`), package `fr.auxfilsdesidees.vigie`.
- Minimum Android 7.0 (API 24), compiled and targeted for Android 17 (API 37).
- Data: `GET /v1/point`, `GET /v1/vigilances?lat&lon&lang=fr,en`, `GET /v1/activities/overview` and
  `GET /v1/activities/{spot}?days=3` (the first spot) of `https://vigie.auxfilsdesidees.fr`; for the beach shown on the
  Mer tab, `GET /v1/surf/spots/{spot}?days=2`, `GET /v1/activities/{spot}`, and at its point `GET /v1/point` (the water,
  once an hour at most) and `GET /v1/sea/places?type=bathing` (once a day at most); and the site's place search
  `GET /data/places.json?q=` (GeoNames, CC BY 4.0, credited under the search), which also names the place « Ici »
  (`?lat&lon`, the nearest town); for the sea map, `GET /v1/activities/overview`, `GET /v1/surf/overview` and the site's
  base map `GET /data/basemap/dark.json`, whose tiles, fonts and icons come from `tiles.openfreemap.org` (it sees the
  area shown, as any web map does), or, when chosen, the IGN's plan and photographs from `data.geopf.fr` (the same);
  when turned on in its layers' menu, the site's wind measured `GET /data/wind.json?bbox=` (whole degrees around the
  view, again after 6 minutes) and rain radar `GET /data/radar.json?area=` with its tiles `GET /data/radar/…` (again
  after 5 minutes), both Météo-France's, never `/v1/point`.
  Nothing is sent but the search typed and the coordinates of the places; the choices stay
  on the phone (the app's private preferences); no account, no tracking. A place with a bell (below) is one
  exception: its name and point go to the site, with the phone's notification address. A phone linked to an account
  (below) is the other: the site keeps its notification address with the account.
- The frame, as the Home Assistant card (chosen by the author on 27/11/2026 among three sketches): nothing fixed around
  the card, no bar at the bottom. The head of the glass card holds the place (and a dot per followed place on the
  Accueil), « Relevé à 14 h 36 » (on a line of its own when the read is old or failed), the mark of the warnings and the
  gear, over the bar Accueil · Détails · Heures · Mer. Everything scrolls, the system bars too; a tab is changed at the
  top of the page.
- Places and spots: the first launch asks for a place (search, or the phone's approximate position rounded to about
  1 km, asked only when touched), then offers the nearest spots, those within 60 km ticked (three at most). Later, the
  gear in the head of the card opens « Mes lieux et mes spots »: the followed places (touch one to show it, cross to stop
  following it, « Ajouter un lieu »), the spots of the shown place (the curve puts one first: the frise draws it) and the
  nearest other spots. Accueil and Détails swipe between the places; Heures and Mer show the place shown last. The
  search puts the places of France first (the site ranks equal matches by population).
- « Ici » follows the phone: « Utiliser ma position » makes the place « Ici » (one at most), whose point is read again
  each time the app comes to the front (approximate permission only, never in the background; Android itself blurs
  it by a kilometre or two), rounded to about 1 km, and named by the site's nearest town (« Ici · Sainte-Anne »; « Ici »
  alone while the site names none). It keeps its key wherever it goes, so its page and its widgets follow it, and the
  hours are those of the place. Its spots follow it too: those more than 60 km away wait aside and come back when the
  phone does; in a new place without any of them, the nearest spots are followed. The « Ma position » of before (a
  point taken once) becomes « Ici » at the first start of this version, with its spots, its bell and its widgets.
- Official warnings: those of the place's exact point (`/v1/vigilances`: an area that holds it, a river section within
  5 km; in France Météo-France and Vigicrues), never `local_alert_level` of `/v1/point` (a level Vigie works out over a
  wide radius, not a warning). Read and worded as the site's widget does (`src/lib/widget/model.ts`, `text.ts`), so the
  family says the same thing: a banner in the head of the card on Accueil and Détails (the highest level, its
  phenomena, until when, « +1 » for the others), touched to open every warning with its period, its area and the
  issuer's bulletin; a mark in the head on every tab (a green check when none is in force, « Aucune vigilance en
  cours » for a screen reader; grey when none is read; the colour of the level, touched to open them, when some are); a « Vigil. » row in the frise draws each warning over its hours (a river in flood has none: the
  banner says it). The end shown is `ends_utc`, else `expires_utc` (the end of the bulletin), as on the widget.
- Accueil, in the card under its head: the home page of Vigie's Home Assistant card (`vigie-card.js` of the API), redrawn
  natively in the card's dark colours so that both show the same thing (`ui/board/`). The weather now (its icon, its
  temperature on the ramp, its words, feeling, humidity, wind) with the highest gust of the next hours, the pressure and
  its trend, the air and the UV, the next sunset and sunrise; the rain of the hour (PIAF's 5-minute bars in France, else
  four 15-minute steps; « non lue » past 30 minutes, as elsewhere in the app); the strongest line of the season
  (avalanches, a drought from « alerte », pollen); the next 24 hours by 1, 2 or 3 hours as the width allows (sky,
  temperature curve, rain and its chance, wind) and seven days at most (highest and lowest curves, rain, wind and gust
  over a whole day, the hours of sunshine under the icon), each column tinted by its sky (« Lueur »: a day's share of
  sunshine over its daylight when the answer gives it). The icons are the card's SVG, copied by
  `tools/family_icons.py` (`--check` tells whether the copy still matches a card). Forest fires, which the card's season
  line also reads, come from another answer the app does not read yet.
- Détails, as in the card: a tab of the bar only when the place has details (the rain tile of the Accueil opens it; a
  swipe still changes the place). The rain until the first noon 12 hours ahead in a few periods
  (« Sec → 14 h 50 », « Pluie faible », « Accalmie »), the hour to come by 5 minutes, AROME-PI by quarter hour (gusts and
  their peak, periods of precipitation, hail and visibility), 48 hours hour by hour (sky, rain, its chance, wind) and the
  chances of the ensembles PE-AROME by window of 3 hours, then who the values are from (`ui/board/DetailsBoard*.kt`).
- Mer, as the Sea page of the Home Assistant card (`pageSea` of `vigie-card.js`, the sketch chosen on 2026-11-27), in the
  card under its head: a tab per followed spot of the place (« Corsaires », « Côte des Basques »), then for the beach
  shown its name, whether the sea rises or falls, the next high or low water and the coefficient, the water; six tiles
  (waves and the state of the sea, swell, wind and whether it blows from the sea or the land, the baïnes from three hours
  before to three hours after low water on the coast from Charente-Maritime to the Basque Country, the class of the
  water of its monitored bathing site, its lifeguards, else the sun), shorter words when one would be cut; the four
  activities with their verdict, their best slot or why, and their 24 hours; the tide of 24 hours; the next hours by 3
  hours (waves, period, wind); then who the values are from (`ui/board/SeaBoard*.kt`). A beach is read when it is
  shown, its copy on the phone first (`data/Beach.kt`, a folder of its own): again after 10 minutes, or after a minute
  when the place is read again. Its water is asked once an hour at most, since `/v1/point` is limited per address on the
  public server, and its bathing site once a day. A copy shown because the read failed says how old it is.
- The sea map, as the site's `/sea` (the sketch chosen by the author on 2026-11-28): the map button in the head of the
  card, next to the gear, opens it on the place shown (France when there is none). The site's dark OpenFreeMap base map,
  its names in French and its land and water in the site's colours, drawn by MapLibre Native (about 13 MB more on the
  phone). A dot per spot of the activity chosen (Surf, Kite / wing, Bateau, Pêche à pied) in the colour of its verdict
  (`/v1/activities/overview`), and, as on the site, a label of the hour for those the map has room for, the best first: the swell and its period for
  surf (`/v1/surf/overview`), the wind and where it blows for kite and boat, the stage of the tide for fishing, and the
  arrow of the tide on all. A search of
  the spots of the map and of the site's towns, the phone's position on request (asked when touched), a legend, and
  the credits of OpenFreeMap, OpenMapTiles and OpenStreetMap, touched to open the copyright page. The pins are read
  again when the map opens after 10 minutes; the base map once (`data/SeaMap.kt`, `ui/map/`). A touch on a spot, a
  followed place or a town of the base map opens its sheet from the bottom (half the screen, or most of it pulled up):
  the beach as the Mer tab draws it, or the town's weather as the Accueil (`/v1/point`), read when it opens and again
  after 10 minutes. Its star follows it, in the followed places the app already has (`data/Favourites.kt`): a spot
  joins the nearest followed place within 60 km, else it comes with its town (the site's, as « Ici »), which becomes a
  followed place; a town is followed alone. The Accueil, the Mer tab and the widgets read it as any other; a note says
  where it went, with « Annuler » for 6 seconds. A followed spot has a star in place of its dot, a followed place a pill
  with its name. The map's reads of `/v1/point` keep to 4 a minute (`data/PointGate.kt`), under the server's 10. The
  layers button, right of the search, puts another base map under the pins: the IGN's plan (its own style and colours,
  France and its overseas departments), or its aerial photographs under the dark plan's names, the dark sea over them
  (out at sea the IGN serves white pictures). Licence Ouverte 2.0, no key; the credits follow the base map. The choice
  is kept on the phone; when the IGN cannot be read, the map stays on the dark plan and says so.
- The hours tab: for today, the 24 hours from now; for the next two days, from 6 h. Rows: sky, temperature, rain and
  wind from `hourly` of `/v1/point` (ADR 0040 of the API; when it is missing, the tab says so and shows the rest), the
  official warnings of the place, then the tide, the coastal warning (« Côte ») and three activities of the first spot. Touch or drag it: the reading under it
  follows the finger. Night hours are shaded and show no verdict.
- Offline: the last good read of every followed place is kept on the phone (the texts the API served, the overview cut
  down to the place's spots, in the app's folder that the phone's backup leaves out). It shows at once at the next
  launch while the network answers, and stays when it does not, with when it was read, in the head of every tab: « Données
  d'hier 18 h 05 · Pas de réponse du serveur… ». A failed or unreadable read never replaces it; a place no longer followed loses its copy.
  The screen then reads as of that time (the frise, the days, the warnings); the rain of the hour to come, past 30
  minutes, reads « non lue ».
- The home screen widget « Vigie · mon lieu » (Glance): its place is chosen among the followed places when it is
  placed, with the next hours or the next days (« Paramètres » of the widget changes them). It is the home page of the
  Home Assistant card drawn smaller, as the site's medium and large widgets: with the room for it (about four cells by
  five on a phone) the whole page (now and its facts, the rain tile, the season, the 24 hours, the days); with less
  (four by three, or three cells wide at a smaller scale) now, the rain tile and the hours or the days chosen; the place
  and the warning on a line above. The page is the app's (`ui/board/HomeBoardView.kt`, its hours and days drawn by the
  same code) in one picture at a scale given by the height and the width (330 wide at scale 1), 0.7 at least; too small for
  that, the widget is the frise below. Touched, it opens the app on its place. It reads only the copies the app keeps:
  every half hour (WorkManager), and at once when it is placed, the places shown by a widget are read again when their
  copy is older than a quarter of an hour; without network it shows its copy with its age, the rain of the hour then
  « non lue ». The app redraws it after each read it keeps. From Android 15, the widget list shows it drawn by the same
  code from made-up values (« Mon lieu »).
- The widget « Vigie · la frise »: the site's small widget (the piste F chosen on 2026-11-27) at every size, one picture.
  On top the weather now, the place and the warning, discreet (its sign and its words in the colour of its level); then
  the next hour as its twelve steps of rain on a tint of rain, followed by the next hours or the next days in « Lueur »
  columns; under them the sentence of the rain, as the card says it (« Pas de pluie avant demain vers 9 h » when the
  hour is dry). Taller it is drawn larger in the middle of the height, the rain at the foot of every column (its bar and
  its amount, « sec » for a dry day), with the days under the hours from about four rows; on one row of the grid, the weather now stands beside the band. Same choice of place, refresh, age and touch as
  « Vigie · mon lieu ».
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

The bells, the account link, the place search and the town of « Ici » go there until the next start without the extra. `--ez vigie_debug_token true` asks the permission and
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

### A build for Google Play

Google Play takes an Android App Bundle signed with an upload key, then signs the app with its own key (Play App
Signing). The upload key stays outside the repository; the build reads it from the environment only:

```sh
export VIGIE_UPLOAD_KEYSTORE=/path/to/upload.p12   # a PKCS12 keystore
export VIGIE_UPLOAD_ALIAS=upload                    # the default
export VIGIE_UPLOAD_KEYSTORE_PASSWORD=...           # the keystore's and the key's
./gradlew bundleRelease -Pvigie.versionCode=2 -Pvigie.versionName=1.1   # app/build/outputs/bundle/release/app-release.aab
```

Each build sent needs a higher `versionCode` than the last one Google Play took (1 and « 1.0 » when unset). Without
`VIGIE_UPLOAD_KEYSTORE` (the CI), `bundleRelease` and `assembleRelease` leave their output unsigned. Build it with the
Firebase config above, or the app sent has no bell.

## Layout

| File | Role |
|---|---|
| `data/VigieRepository.kt` | the requests of a place's refresh, run together; the spot catalogue; the place search |
| `data/VigieParser.kt` | JSON to models; an unknown field is ignored, a missing one stays null |
| `data/PlacesStore.kt` | the followed places and their spots, and every change to them (tested on the JVM) |
| `data/Beach.kt` | a beach of the Mer tab: its four answers cut down and kept, read back, asked again (tested on the JVM) |
| `data/OfflineCopies.kt` | the last good read of each place, kept on the phone for the launch and the offline (tested on the JVM) |
| `data/Geo.kt` | distances, the nearest spots, the rounding of a position (tested on the JVM) |
| `data/AppData.kt` | the places, the copies and the API client, shared by the app and the widget; the beaches' reader |
| `widget/WidgetModel.kt` | the warnings, the age and the words of the rain of the hour, read from a place's copy as the site's widget reads them (tested on the JVM) |
| `widget/BoardWidget.kt` | what both widgets show, in the card's rules: the rain of the hour and its sentence, the frise's columns, the card's blocks and the height they need, the scale, the look by the room (tested on the JVM) |
| `widget/BoardArt.kt` | both widgets drawn into one picture each: the frise, and the card's home page at a scale, its hours and days drawn by `ui/board/BoardColumns.kt` |
| `widget/PlaceWidget.kt` | the place widget (Glance): its look by the room, its preview in the widget list; the frame and the picture both widgets share |
| `widget/FriseWidget.kt` | the frise widget (Glance) |
| `widget/WidgetRefresh.kt` | the half-hourly read and the redraw of the widgets; their receivers |
| `widget/WidgetConfigActivity.kt` | the choice of the widget's place and of its next hours or days, when it is placed or reconfigured |
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
| `ui/WarningsScreen.kt` | the banner of the Accueil and the page of the warnings of a place, with the bulletins |
| `ui/Frise.kt` | the frise's days and hours, tide between extremes (tested on the JVM) |
| `ui/HoursTab.kt` | the hours tab: day pills, the frise drawn on a canvas, the reading of an hour |
| `ui/Drawing.kt` | weather icons, wind arrow, activity glyphs, monotone curve |
| `ui/VigieApp.kt` | the frame: the head of the card and its bar of tabs, Accueil and Détails swiped between the places, Mer |
| `ui/SeaViewModel.kt` | the beaches of Mer: the copy first, then the network when it is older than asked |
| `data/SeaMap.kt` | the sea map's data: the pins of an activity and their labels, as the site's `src/lib/sea/map.ts`; the base map in the app's colours and in French, the IGN's plan and photographs; its reader (tested on the JVM) |
| `data/Favourites.kt` | the star of the sea map: a spot or a town followed in the places the app has, and « Annuler » (tested on the JVM) |
| `data/PointGate.kt` | the sea map's share of `/v1/point`: 4 a minute (tested on the JVM) |
| `ui/map/SeaMapViewModel.kt` | the sea map's state: the base map chosen and kept, each read once, the pins again after 10 minutes, the activity, the search, the sheet and what it reads |
| `ui/map/SeaMapScreen.kt` | the sea map: MapLibre's view and its life, the search, the base maps, the activities, the legend, the position, the credits, the sheet, its star and its note |
| `ui/map/MapLayers.kt` | the pins on the map: their source, their dots, their labels drawn as pictures and kept apart by MapLibre; the stars of the followed spots, the pills of the followed places, what a touch finds |
| `ui/board/HomeBoard.kt` | what the home page says, worked out as the Home Assistant card works it out (tested on the JVM) |
| `ui/board/HomeBoardView.kt` | the home page drawn: now, the rain of the hour, the season, the 24 hours, the days |
| `ui/board/DetailsBoard.kt` | what the Details page says, worked out as the card's Details page (tested on the JVM) |
| `ui/board/DetailsBoardView.kt` | the Details page drawn, and the bar of pages « Accueil \| Détails » |
| `ui/board/SeaBoard.kt` | what the Sea page says, worked out as the card's Sea page (tested on the JVM) |
| `ui/board/SeaBoardView.kt` | the Sea page drawn: the tabs of the beaches, the head, the tiles, the activities, the tide, the table |
| `ui/board/BoardPalette.kt` | the card's dark colours: temperature ramp, rain and wind blues, the « Lueur » of a column |
| `ui/board/BoardColumns.kt` | the hours and the days of the home page and their heights, drawn once for the app and the widgets |
| `ui/board/FamilyIcons.kt` | the family's weather icons and the card's glyphs, drawn from their SVG (tested on the JVM) |
| `ui/board/FamilyIconData.kt` | those SVG, written by `tools/family_icons.py` from the card; not edited by hand |
| `ui/theme/` | the charter's « Ciel » colours and type scale |
