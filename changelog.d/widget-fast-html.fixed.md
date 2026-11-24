- The widget page (`/widget`) answers at once when its surf spot is not in the site's cache: it waits 150 ms for the
  spot at most, then the browser reads it from `/data/widget-spot.json`, so the place (its sky, its warnings, its rain)
  shows meanwhile. The Windows widgets board shows only a spinner until the page has come: with a spot whose cache had
  run out, the page took 1.3 s, up to 9 s, to send its first byte. The summary sent to the desktop app waits for the
  spot, and the spot read every ten minutes stays on screen until the new reading comes.
