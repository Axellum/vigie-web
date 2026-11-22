# Vigie for Android

A first, small native app that reads the public Vigie API. It is a skeleton: three tabs (home, hours, sea), the weather
of one town and the activity verdicts of four spots, in French. The place and the spots are fixed for now; choosing
them, the official warnings of the place, the hour-by-hour chart and widgets come later. It is not on any store.

- Kotlin and Jetpack Compose, one module (`app`), package `fr.auxfilsdesidees.vigie`.
- Minimum Android 7.0 (API 24), compiled and targeted for Android 17 (API 37).
- Data: `GET /v1/point` and `GET /v1/activities/overview` of `https://vigie.auxfilsdesidees.fr`. Nothing is sent but
  the coordinates of the town; no account, no tracking.
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

## Layout

| File | Role |
|---|---|
| `data/VigieRepository.kt` | the two requests of a refresh, run together |
| `data/VigieParser.kt` | JSON to models; an unknown field is ignored, a missing one stays null |
| `ui/Words.kt` | the French words: weather, wind, verdicts, reasons, times (tested on the JVM) |
| `ui/VigieApp.kt` | the tabs and their cards |
| `ui/theme/` | the charter's « Ciel » colours and type scale |
