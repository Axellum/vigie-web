# Vigie for Android

A first, small native app that reads the public Vigie API, in French. Three tabs: the weather of one town (home), a
frise of the next 24 hours (hours), and the activity verdicts of four spots (sea). The place and the spots are fixed for
now; choosing them, the official warnings of the place and widgets come later. It is not on any store.

- Kotlin and Jetpack Compose, one module (`app`), package `fr.auxfilsdesidees.vigie`.
- Minimum Android 7.0 (API 24), compiled and targeted for Android 17 (API 37).
- Data: `GET /v1/point`, `GET /v1/activities/overview` and `GET /v1/activities/{spot}?days=3` (the first spot) of
  `https://vigie.auxfilsdesidees.fr`. Nothing is sent but the coordinates of the town; no account, no tracking.
- The hours tab: for today, the 24 hours from now; for the next two days, from 6 h. Rows: sky, temperature, rain and
  wind from `hourly` of `/v1/point` (ADR 0040 of the API; when it is missing, the tab says so and shows the rest), then
  the tide, the coastal warning and three activities of the first spot. Touch or drag it: the reading under it
  follows the finger. Night hours are shaded and show no verdict.
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

### Trying an API that is not deployed

A debug build can read a Vigie API run on the computer, through the USB cable (a release build ignores this):

```sh
adb reverse tcp:8080 tcp:8080
adb shell am start -S -n fr.auxfilsdesidees.vigie/.MainActivity --es vigie_base_url http://127.0.0.1:8080
```

Only the loopback address is accepted, and plain HTTP is allowed for it in the debug build alone
(`app/src/debug/res/xml/network_security_config.xml`).

## Layout

| File | Role |
|---|---|
| `data/VigieRepository.kt` | the three requests of a refresh, run together; the first spot's hours may fail alone |
| `data/VigieParser.kt` | JSON to models; an unknown field is ignored, a missing one stays null |
| `ui/Words.kt` | the French words: weather, wind, verdicts, reasons, times, sentences (tested on the JVM) |
| `ui/Frise.kt` | the frise's days and hours, tide between extremes (tested on the JVM) |
| `ui/HoursTab.kt` | the hours tab: day pills, the frise drawn on a canvas, the reading of an hour |
| `ui/Drawing.kt` | weather icons, wind arrow, activity glyphs, monotone curve |
| `ui/VigieApp.kt` | the tabs and their cards |
| `ui/theme/` | the charter's « Ciel » colours and type scale |
