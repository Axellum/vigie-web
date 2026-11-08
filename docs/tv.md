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

## A personal page on a screen

`/tv/p/<secret>` shows the page of an account ("My page", behind a sign-in) on a screen that has no keyboard to sign in with:
a television, a tablet on a wall. Whoever holds the address sees that page, and nothing else of the account. The secret is
made when the person makes a link, shown once, and only its SHA-256 is kept; the rules of the link (what it shows, that it
can be revoked, the headers) are written in ADR 0020 of vigie-api, and `src/lib/server/pageLinks.ts` keeps them.

It is the same screen as above (the clock, the day and the night, the turns, the new readings, the "offline" line), with one
panel for each block of the page, in the order the person set, and above it the place and the card:

| Card      | What the panel shows                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `weather` | The sky (temperature, feels-like, UV, the sun of the place), the wind now, the rain of the next hour.                |
| `sea`     | The swell (the waves when the API gives no swell), the temperature of the sea (a model value), the wind now.         |
| `tide`    | The curve of the tide for 24 hours, the next two high and low waters, the range, the coefficient where it is French. |
| `air`     | The European index as the API gives it (no word is added to it) and the fine particles.                              |

- **What it leaves out.** The official warnings, the hazards, the surf spots and the sky cards are not drawn yet: the screen
  skips them, and says "nothing to show here" for a page that has none of the four above (the home alone, for one) instead
  of an error. The size of a block means nothing on a television. The units of the account are not applied yet: the screen
  speaks in °C, knots and metres. A page of more than 12 such blocks shows the first 12 (`MAX_PANELS`).
- **The clock.** It is the clock of the first place whose weather answered (the API gives the offset of the time zone of
  each point). Without one the clock stays empty, and the times of the tides are dashes: the screen does not write the hour
  of another zone. The day and the night follow the sun of that first place, worked out by `src/lib/tv/sun.ts` (the
  sunrise equation, within two minutes of the sun the API gives for a spot, checked against a recorded answer).
- **The address.** `d`, `theme`, `r` and `reload` mean the same as above. The language is the account's, not the browser's.
- **The answers.** 200 with the screen; 200 with a message for a page with nothing to draw; 404, with the words of any other
  404, for a link that is unknown, revoked or badly formed (one cannot be told from the other); 503 when the database does
  not answer, and then a screen that was showing keeps its last value and says it is offline. A screen whose link is revoked
  reads the 404 at its next reading and reloads, so it shows the 404 too, within about 5 minutes of the revocation (the
  site keeps a read for a minute).
- **The secret stays in the address.** It is not in the title of the page (always `Vigie · TV`), in an attribute, in a log, in
  an error. The headers of the address (`Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex, nofollow`) are the site's (`securityHeaders.ts`), not the route's. The page has no link at all, and
  loads nothing from another site. One thing needed a fix of its own: the stylesheets of the site are inlined in the page, and
  Chromium then sent the address of the page as `Referer` for each font file (the same site, but an access log keeps it)
  whatever the header said. The page therefore preloads its five font files with `referrerpolicy="no-referrer"`, and the
  stylesheet reuses them; `e2e/tv-private.spec.ts` fails if any request of the page carries a `Referer`. A browser older than
  Chromium 56 does not know the header: its requests carry the address, to this site only, so the access log of the Deck
  should not keep `Referer` (the example skips the address itself).
- **Where the links are made.** In "My page" (`/me`), the section "Screens (television, tablet)" (`MyLinks.svelte`): a name
  to recognise the link, a button, and the address, shown once in the answer of the form that made it (not in the address of
  the page, a cookie or a log; a reload forgets it). The list shows the name, the day it was made and the last time it was
  opened (at most once an hour), with "Revoke" after a question. The section says which cards a screen draws (`TV_CARDS`) and
  how many blocks of the page that is, and the options that may follow the address (`theme`, `d`, `r`, `reload`). At most
  10 active links for an account (`MAX_LINKS`); a revoked one leaves the list.
- **What it asks of the API.** Each place of a drawn block costs one reading of the weather (15 minutes, from the same
  share as the screens of the spots, `VIGIE_TV_POINT_LOOKUPS_PER_DAY`: at most 96 a day for each place, whatever the number of
  screens) and, for a tide card, one reading of the tide. Several blocks of one place share their readings. Past the share, the
  panels say "no data".

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
- The cards a screen of a personal page does not draw (official warnings, hazards, surf spots, sky), the units of the account
  and the sizes of the blocks: see "A personal page on a screen".
- That screen has been looked at in a desktop browser at 1920 × 1080 and by the end-to-end tests; not yet on a television, and
  not at other ratios.
- The page that makes the links has been looked at in a desktop browser and by the end-to-end tests; not on a phone by eye.
