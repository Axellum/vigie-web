- The tiles of the map's rain layers stay longer in the site's memory (radar 4,000 instead of 400, observed rain 2,000
  instead of 256, forecast rain images 96 instead of 24), and the PIAF nowcast tiles drawn with the run of their address
  are kept too. In a visitor's browser, the service worker keeps at most 800 of these images, the oldest going first:
  a page left open on a screen piled them up until the next version of the site.
