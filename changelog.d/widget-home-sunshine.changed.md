- The home face of the widget page (`/widget?face=home`, the flyout of the Windows app) takes the Home Assistant card
  of vigie-api again: each day says its hours of sunshine under its icon (« 7 h », « 50 min ») and its column is tinted by
  their share of its daylight. Nothing changes on the server: `/data/card.json` already passes `sunshine_h` along.
