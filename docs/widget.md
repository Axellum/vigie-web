# The widget page

`/widget` is a page a few hundred pixels wide, for a desktop app that shows it in a small panel: a widget of the Windows
widgets board, the flyout of an icon near the clock, a small window. It shows one place, one surf spot, or both, in
three sizes. It is made with AI and shared in case it helps; it does not replace the official warnings.

```
https://<the site>/widget?size=medium&theme=sky&spot=anglet-plage-de-la-madrague#43.483,-1.559/Biarritz
```

| Part          | Values                        | Default   | Meaning                                                        |
| ------------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| `size`        | `small`, `medium`, `large`    | `medium`  | About 300 × 100, 300 × 256 and 300 × 572 pixels.               |
| `theme`       | `sky`, `dark`, `light`        | `sky`     | The three themes of the family's common charter.               |
| `spot`        | an id of the surf spots       | none      | `/surf` and `/v1/surf/spots` give the ids.                     |
| `frame`       | `board`                       | none      | In the Windows widgets board: see below.                       |
| `lang`        | `fr`, `en`                    | browser's | The language of the page, as everywhere on the site.           |
| after the `#` | `lat,lon` then `/` and a name | none      | The place, and the name to show for it (the name is optional). |

A value that makes no sense is replaced by its default, never by an error.

A host may give the page another height than its size says. The page never cuts a part in the middle: it hides whole
parts until the rest fits, the five days first, then the gusts forecast, the wind, and the spot last. The warnings, the
rain of the hour and the header always stay.

In the Windows widgets board (`frame=board`), Windows writes the widget's name over the top 48 pixels, which the page
leaves empty, and the page takes its layout from the height it is given rather than from `size`: measured in November
2026, the board gave a medium web widget the same 300 × 462 pixels as a large one. From 360 pixels the page shows the
large layout, from 200 the medium one, below that the small one.

## What it shows

- **A place**: its sky, its temperature and how it feels; the official warnings whose area holds it (level, phenomena,
  until when); the rain of the next hour in four steps of 15 minutes, a forecast of the weather model (the radar fields of
  the API are not used); the wind measured by the nearest station within 25 km, else the forecast wind. The large size
  adds the gusts that Météo-France's AROME-PI model forecasts, the next five days and, with a `spot`, its verdicts.
- **A surf spot** (a `spot` without a place, or inside the large size): the verdicts of its four activities for the next
  twelve hours, from the same model as the television screens (`/tv`), its swell and its next tide. "Vigie's rules, not
  for safety" is written under them.
- **Outside France** the page shows less, never a guess: no measured wind where no station is near, no AROME-PI gusts,
  "no official warning read here" where the API reads no source.

## Privacy

The place is after the `#`: the browser never sends it to the server. It matches the place against the warnings of the
countries around (`/data/warnings/<cc>.json`, the same for everybody) and asks the weather of its cell of the grid only
(about 5 km), as "near me" does; the measured wind is asked for a box of whole degrees around that cell. The spot is in
the query: the server draws it from its cache, as for a television. The page waits 150 ms for it at most: when the
spot is not in the cache (its sources are read again, 1 to 9 s on a quiet morning), the page comes without it and the
browser reads it from `/data/widget-spot.json?spot=<id>&lang=<lang>`, so that the place shows meanwhile. The Windows
widgets board shows only a spinner until the page has come.

The page reads everything again every ten minutes, and when it comes back into view after five.

## For the app that shows it

Inside WebView2 (`window.chrome.webview`), the page posts a message each time what it shows changes: `type`
(`vigie-summary`), `version`, `ready` (false while the warnings or the weather of the place, or the spot, still load), `name`,
`vigilance` (`state`, `level`, `labels`, `until`), `rain` (`status`, `inMin`, `forMin`, `maxMmH`), `tempC`, `spot`
(`name`, `activity`, `verdict`, `slot`) and `at`. The app colours its icon and writes its notifications from it, so
that it never matches a place against the warnings itself. An ordinary browser has no such host and gets nothing.
