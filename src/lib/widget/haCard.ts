// Written by scripts/sync-ha-card.mjs: the copy of the Home Assistant card in static/ha-card/, and where it comes from.
// Do not edit by hand (src/lib/widget/haCard.test.ts checks the copy against it).

/** The card of vigie-api (`custom_components/vigie/frontend/vigie-card.js`) at this commit. */
export const HA_CARD_COMMIT = '2774a55cb51181a3b12555c43773ee5c1c3b13fc';
/** The SHA-256 of `static/ha-card/vigie-card.js`. */
export const HA_CARD_SHA256 = '5991296969fba0e359c4cba655b7c9b335d4a20976c81664492d7ea7760885b8';
/** Where the page loads it from; the digest in the query, so that a new copy is never served from an old cache. */
export const HA_CARD_URL = `/ha-card/vigie-card.js?v=${HA_CARD_SHA256.slice(0, 12)}`;
