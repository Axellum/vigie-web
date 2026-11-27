// Written by scripts/sync-ha-card.mjs: the copy of the Home Assistant card in static/ha-card/, and where it comes from.
// Do not edit by hand (src/lib/widget/haCard.test.ts checks the copy against it).

/** The card of vigie-api (`custom_components/vigie/frontend/vigie-card.js`) at this commit. */
export const HA_CARD_COMMIT = '2bd26dad0b143f5192624c00d6555a57c2166c6d';
/** The SHA-256 of `static/ha-card/vigie-card.js`. */
export const HA_CARD_SHA256 = '71e4b9108badc910859d8ca180f266239f7576c1cf86e184acb4ad534b55e626';
/** Where the page loads it from; the digest in the query, so that a new copy is never served from an old cache. */
export const HA_CARD_URL = `/ha-card/vigie-card.js?v=${HA_CARD_SHA256.slice(0, 12)}`;
