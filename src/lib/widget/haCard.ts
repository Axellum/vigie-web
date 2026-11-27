// Written by scripts/sync-ha-card.mjs: the copy of the Home Assistant card in static/ha-card/, and where it comes from.
// Do not edit by hand (src/lib/widget/haCard.test.ts checks the copy against it).

/** The card of vigie-api (`custom_components/vigie/frontend/vigie-card.js`) at this commit. */
export const HA_CARD_COMMIT = '08ceb9c1ed1ed338bbbeb96126214c57357222b7';
/** The SHA-256 of `static/ha-card/vigie-card.js`. */
export const HA_CARD_SHA256 = 'b5537a099c3826b76f0b9be70e092b65562c8b63e429ddb4db49eaa704db5c2c';
/** Where the page loads it from; the digest in the query, so that a new copy is never served from an old cache. */
export const HA_CARD_URL = `/ha-card/vigie-card.js?v=${HA_CARD_SHA256.slice(0, 12)}`;
