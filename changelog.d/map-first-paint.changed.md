- The map shows its first tiles sooner: the site serves OpenFreeMap's style with the address of its tiles written in
  (`/data/basemap/light.json`, `dark.json`; asked again every 15 minutes, OpenFreeMap's own style used when the site
  cannot make it), so the map no longer waits for the description of the tiles between the style and the tiles, and
  the page opens the connection to the base map while it loads.
