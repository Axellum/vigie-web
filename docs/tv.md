# Screens for televisions

`/tv` is a page for a television or a monitor that nobody touches: in a harbour office, a club house, a shop on the
seafront. It shows the sea and the weather of one place, readable from a few metres, and keeps itself up to date. It is
made with AI and shared in case it helps; it does not replace the official warnings (Météo-France, CROSS, harbour
office), and says so on every screen.

Open `/tv` with no place to get the list of places; each one is a link. A screen is set entirely by its address, so
that it survives a restart of the television's browser:

```
https://<the site>/tv?spot=soorts-hossegor-plage-sud-point-d-or&preset=port
```

| Parameter | Values                        | Default           | Meaning                                                                                                       |
| --------- | ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `spot`    | an id of the surf spots       | – (a list)        | The place. `/surf` and `/v1/surf/spots` give the ids.                                                         |
| `preset`  | `port`, `club`, `shop`        | `port`            | What the screen is for: the boat and the wind (port), the swell and the wind (club), the day (shop).          |
| `panels`  | `cadran`, `verdicts`, or both | `cadran,verdicts` | `cadran`: three instruments (wind, tide, swell or boat). `verdicts`: the answer first, one card per activity. |
| `d`       | 5 to 300                      | `20`              | Seconds a panel stays when there are two.                                                                     |
| `theme`   | `auto`, `day`, `night`        | `auto`            | `auto` follows the sun of the place; the hours come from the same data as the screen.                         |
| `r`       | 60 to 3600                    | `300`             | Seconds between two readings of the page.                                                                     |
| `reload`  | 1 to 48                       | `12`              | Hours between two full reloads of the page (against a browser that grows over days).                          |
| `lang`    | `fr`, `en`                    | the browser's     | The language of the screen.                                                                                   |

A value that makes no sense is replaced by its default, never by an error.

## What it does by itself

- **Clock**: the time and the date of the place come from the server, not from the television, whose own clock is often
  wrong. The place's time zone is the spot's.
- **Panels** take turns every `d` seconds; with one panel, or when the script does not run, the first one stays.
- **Day and night**: the colours change at sunrise and sunset of the place; both themes have at least 7:1 contrast for
  the text (checked by `src/lib/tv/tv.test.ts`).
- **Reading again**: every `r` seconds the page asks the site for itself and replaces the screen. When the site does
  not answer, the last screen stays and a band says "offline, last update hh:mm"; it asks again every minute.
- **Reload**: the whole page is reloaded every `reload` hours, and at once when the site has a new version.
- **Burn-in**: the screen moves by a few pixels every two minutes.
- **Old data** older than 30 minutes are said on the screen ("data of hh:mm").
- **Credits and warning** are always at the foot of the screen: a television cannot follow a link. The QR code in a
  corner opens the full page of the place on a phone.

## What it needs

A browser of 2018 or later (Chromium 53 and newer: the browsers of most smart televisions of 2018 to 2021). The page
sends no script of the framework: the screen is drawn by the server, and a script of about 300 lines in plain ES5
(`src/lib/tv/screen.es5.js`) does the clock, the turns and the readings. Nothing is loaded from another site: no
font, no script, no tracker. `src/lib/tv/tv.test.ts` and `screen.test.ts` fail on any CSS or JavaScript that these
browsers do not know.

## What it asks of the API

One screen or a hundred cost the API the same: the site keeps what it reads (the verdicts, the forecast and the tide of
a spot 10 minutes, the weather of the sky 30 minutes) and every screen reads the site. The weather by
place has a share of its own, `VIGIE_TV_POINT_LOOKUPS_PER_DAY` (100 by default, so that a spot costs at most 48 requests
a day): beyond it the sky card shows a dash and the rest of the screen is not affected.

## What is not here yet

- The temperature of the water: the card says that it is not provided yet.
- A page to build the address with the mouse.
- It has been looked at in a desktop browser at 1280 × 720, 1920 × 1080 and 3840 × 2160; not yet on a television.
