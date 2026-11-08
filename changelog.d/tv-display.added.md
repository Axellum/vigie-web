- Screens for televisions, `/tv?spot=…`: a page for a television in a harbour office, a club house or a shop, set entirely
  by its address (`preset` port, club or shop, `panels`, `d`, `theme`, `r`, `reload`). It shows the wind, the tide, the
  swell, the sky and a verdict per activity of one place, readable from a few metres, day and night by the sun of the
  place, and keeps itself up to date: when the site does not answer it keeps the last screen and says "offline, last
  update hh:mm". It is drawn by the server and runs a small ES5 script, for the browsers of televisions of 2018 and
  later; the credits, the warning "does not replace the official warnings" and a QR code to the full page are always
  on screen. The weather of the sky has its own budget, `VIGIE_TV_POINT_LOOKUPS_PER_DAY` (5,000 a day by default).
  See [`docs/tv.md`](docs/tv.md).
