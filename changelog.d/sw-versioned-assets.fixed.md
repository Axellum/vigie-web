- The service worker no longer answers a file of the site asked for in a given version (the Home Assistant card of the
  widget page, `/ha-card/vigie-card.js?v=…`) with the copy it kept: after a deployment, the worker still in place served
  the previous card to the new page until it was replaced. Such a file comes from the network, the copy kept being the
  fallback without a network.
