- Television screens of a personal page (`/tv/p/<secret>`) now render all eight cards (`official`, `hazards`, `weather`,
  `surf`, `sea`, `tide`, `sky`, `air`), apply the account's temperature, wind and height units (`°C`/`°F`, `kn`/`km/h`/`m/s`/
  `mph`, `m`/`ft`), and isolate aurora lookups under `VIGIE_TV_POINT_LOOKUPS_PER_DAY`.
- Keyboardless television pairing (`/tv/pair` + `/me`): 8-character Crockford base32 codes valid 15 minutes, encrypted
  AES-256-GCM pickup on `/tv/pair/poll` via ES5 XHR, and automatic redirect into `/tv/p/<secret>`.
- Signed-in `/me` weather point lookups now draw from `VIGIE_ME_POINT_LOOKUPS_PER_DAY` (default 1,000/day pool, 500/account)
  instead of sharing the anonymous `/near` budget, and reuse fresh marine/TV point caches.
