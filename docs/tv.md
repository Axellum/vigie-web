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

## Setting a screen up with the mouse

`/screens` ("TV screens" in the foot of every page) writes that address from choices: the place (from the list of
`/v1/surf/spots`), who the screen is for, what takes turns and for how long, day and night, the language, and, in
"Advanced settings", the reading and reload times. It saves nothing: the choices live in the address of the page itself
(`/screens?spot=…&preset=club`), so a reload keeps them and a link sends them to someone. The address of the screen is
shown with a button to copy it and a link to open it.

- Only what differs from the defaults is written, except `lang`, which is always there: a television's browser does not
  necessarily speak the language of the shop. On the page, `lang` sets the language of the page itself and `tvlang` the
  one of the screen.
- With one panel only, `d` is left out: it means nothing then.
- The address is built by `src/lib/tv/address.ts` and read back by `parseTvParams`, the code of the screen itself;
  `address.test.ts` checks that the two agree for every combination, so that what the page shows is what the screen
  understands.
- The page works without a script (a plain form that sends its choices in the address, with a button "Compose the
  address"); with one, every change of a choice sends the form at once.
- When the list of places does not answer, the page asks for the id of a place instead of a list.
- There is no preview of the screen on the page: the site refuses to be framed (`frame-ancestors 'none'`), and the
  address opens in a new tab.

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
- **Rain of the hour**: in the middle of the head, on every preset and panel, one bar per 15-minute step of the next hour
  and a word (none, light, moderate, heavy, with the strongest rate in mm/h). It is a forecast of the weather model that the
  API already gives with the sky, not a radar, and the caption says "forecast". The words are ours, not an official scale:
  light under 2.5 mm/h, moderate under 7.6, heavy from there. A reading older than 30 minutes, or none from the API, shows
  "not read" rather than a rain that may be over.
- **Temperature of the water**: in the card of the sky, "water 17°", with "model value" under it. It is the temperature of
  an ocean model (Météo-France, Copernicus Marine) for a cell of about 8 km, rounded to the degree, **not a measurement at the
  beach**: near a river mouth, in a lagoon or in the surf it can differ by degrees, which is why the card says what it is.
  When the API gives none, the card shows a dash and "not available". The credit of that answer joins the ones at the foot of
  the screen while the temperature is shown. (Needs a Vigie API that gives `marine.sea_surface_temperature_c`.)
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
a spot 10 minutes, the weather of the sky and the rain of the hour 15 minutes) and every screen reads the site. A spot
costs at most 96 requests a day to the API, whatever the number of screens. The weather by place has a share of its own,
`VIGIE_TV_POINT_LOOKUPS_PER_DAY` (5,000 by default, 96 a day for each of the 51 spots): beyond it the sky card shows a dash,
the rain says "not read" and the rest of the screen is not affected.

Neighbouring places share a cell of the API's grid (0.05°, about 5 km): the beaches of the Landes and the Basque coast in
the list (20 of the 51) fall in 14 cells. The API refreshes the current conditions and the rain of a cell every 15 minutes
and the daily forecast every hour, which weighs about 130 calls a day of the source's free quota per cell kept up to date
(by the weights `vigie-api` counts, `app/collectors/weights.py`): 14 cells make about 1,800 a day of the 9,000 the API
lets through, however many screens show them. The weather is asked with the sea (for the temperature of the water): the API
keeps the sea of a cell an hour and reads it in the same request as the waves, so that costs at most 24 more calls a day
per cell, about 340 for the 14 cells (weight 1.0 each), and nothing when the API does not give the temperature.

## What is not here yet

- The temperature of the water of the beach itself: the card gives a model value, not a measurement; a nearer source is not chosen.
- It has been looked at in a desktop browser at 1280 × 720, 1920 × 1080 and 3840 × 2160; not yet on a television.
