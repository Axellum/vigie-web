// Written by scripts/sync-ha-card.mjs: the copy of the Home Assistant card in static/ha-card/, and where it comes from.
// Do not edit by hand (src/lib/widget/haCard.test.ts checks the copy against it).

/** The card of vigie-api (`custom_components/vigie/frontend/vigie-card.js`) at this commit. */
export const HA_CARD_COMMIT = '8093f665bc9c2d65ac1d47dfba1815891d661702';
/** The SHA-256 of `static/ha-card/vigie-card.js`. */
export const HA_CARD_SHA256 = '325c31ee9aedf61359c57041727672b2eeda0f8eec4506ed1925971bfd73af17';
/** Where the page loads it from; the digest in the query, so that a new copy is never served from an old cache. */
export const HA_CARD_URL = `/ha-card/vigie-card.js?v=${HA_CARD_SHA256.slice(0, 12)}`;
