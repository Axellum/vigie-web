- The rain forecast of the map (PIAF, the next hour) shows the newest run: its tiles were kept an hour by the browser and the
  map kept an image already drawn, while a new run every 5 minutes draws the same times again. The address of a tile now
  holds its run (`?run=`): a tile is kept an hour only when the API says it is that run's (otherwise a minute), and the map
  draws an image again when its run changes. Needs a Vigie API that fills the run in `tile_url_template`.
