- The weather of the towns on the home map: a "Weather" family on the rail, on at first, draws a pill for each town the base
  map names in view (40 at most), with the sky and the temperature, a drop and the millimetres when rain is due within 3 hours,
  and the gust when the wind blows hard. A bar under the map picks the moment shown (now, three coming hours, tomorrow morning
  and afternoon, the two days after). Hovering a pill shows the gist (now, the rain of the hour, the next six hours, the day);
  a click opens the Home Assistant card of the place with its Details page, then the air, the fires, the drought and the surf
  spots nearby (a sheet from the bottom on a phone). The towns of a view are read in one request of the API's `/v1/points`,
  on their own daily share (`VIGIE_TOWN_LOOKUPS_PER_DAY`, 4,000 by default), rate-limited apart by the Caddy of the server.
