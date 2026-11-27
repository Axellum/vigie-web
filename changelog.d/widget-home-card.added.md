- The home face of the widget page (`/widget?face=home`): the home page of the Home Assistant card of vigie-api itself (the
  same file, copied by `scripts/sync-ha-card.mjs` at a commit and checked by its SHA-256), at its size of 480 × 760, for the
  flyout of the Windows app. The page answers the card's request for data with the whole answer of `/v1/point` for the cell
  of the place (`/data/card.json`, same budget and lifetime as `/data/point.json`, whose reading it fills) and the official
  warnings it matched against the place itself; the summary the desktop app reads is the widget's, unchanged.
