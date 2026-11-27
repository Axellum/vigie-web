# The widget page

`/widget` is a page a few hundred pixels wide, for a desktop app that shows it in a small panel: a widget of the Windows
widgets board, the flyout of an icon near the clock, a small window. It shows one place, one surf spot, or both, in
three sizes. It is made with AI and shared in case it helps; it does not replace the official warnings.

```
https://<the site>/widget?size=medium&theme=sky&fc=days&spot=anglet-plage-de-la-madrague#43.483,-1.559/Biarritz
```

| Part          | Values                        | Default   | Meaning                                                        |
| ------------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| `size`        | `small`, `medium`, `large`    | `medium`  | About 300 × 146, 300 × 303 and 300 × 462 pixels.               |
| `theme`       | `sky`, `dark`, `light`        | `sky`     | The three themes of the family's common charter.               |
| `fc`          | `hours`, `days`               | `hours`   | What the small and medium widgets forecast.                    |
| `spot`        | an id of the surf spots       | none      | `/surf` and `/v1/surf/spots` give the ids.                     |
| `frame`       | `bare`, `board`               | none      | In the Windows widgets board: see below.                       |
| `lang`        | `fr`, `en`                    | browser's | The language of the page, as everywhere on the site.           |
| after the `#` | `lat,lon` then `/` and a name | none      | The place, and the name to show for it (the name is optional). |

A value that makes no sense is replaced by its default, never by an error.

In the Windows widgets board the page takes its layout from the height it is given rather than from `size`: measured in
November 2026, the board gave a medium web widget the same 300 × 462 pixels as a large one. From 360 pixels the page
shows the large layout, from 200 the medium one, below that the small one. The Windows app asks the board for no title
band (`"header": null` in the card it gives the board) and says so with `frame=bare`: the page has the whole height, and
leaves the top right corner to the board's « ··· » menu. With `frame=board` (an older app), Windows writes the widget's
name over the top 48 pixels, which the page leaves empty.

## What it shows

- **A place, medium and large**: the home page of the Home Assistant card itself (`static/ha-card/`), drawn smaller to
  fill the widget, without the name of the place and the bar of pages: the weather now, the rain of the hour, the
  warning and the season, then the next 24 hours or the next days (`fc`) in the medium size, both and the facts of now
  (gusts to come, pressure, air, sun) in the large one. The page plays the part of Home Assistant for it, as for the
  home face.
- **A place, small**: a frise, made for what other widgets do not show. On top the weather now, the place and the
  official warning whose area holds it, discreet (a triangle and its words in the colour of its level, « Aucune
  vigilance » without one). Then one band: the next hour as a bar per step of rain (the twelve 5-minute rates of
  Météo-France's PIAF in France, else four steps of 15 minutes of the weather model; the radar fields of the API are not
  used), followed by five « Lueur » columns, the next hours (with their rain) or the days from tomorrow (high over
  low), tinted by their sun. Under it the sentence of the rain as the card says it: when it comes and how strong
  (« Pluie dans 35 min » then « faible, puis modérée »), or after a dry hour when the next one comes (« Pas de pluie avant
  demain vers 9 h »), from the nowcast then the hours (the card also reads AROME-PI's steps between them, which the
  site's copy of the answer does not keep).
- **Where the card draws no home page of France** (outside France, or when the API fell back from Météo-France's
  forecast), the medium and large widgets show the frise, larger, rather than a card with the warnings only; the large
  one adds the days, from today, under the sentence of the rain.
- **A surf spot** (a `spot` without a place): the verdicts of its four activities for the next twelve hours, from the
  same model as the television screens (`/tv`), its swell and its next tide. "Vigie's rules, not for safety" is written
  under them. With a place, the spot is no longer drawn; the app still gets it in the summary. A host that gives the
  spot less height than its size says gets whole parts hidden, never one cut in the middle.
- **Outside France** the page shows less, never a guess: four steps of 15 minutes for the rain of the hour, "no
  official warning read here" where the API reads no source.

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
