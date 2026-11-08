// A television screen is a page of its own: rendered by the server and sent without the framework's JavaScript. The browsers of the
// televisions sold from 2018 to 2021 are Chromium 53 to 76 (webOS 4 to 6, Tizen 4 to 6), which the site's scripts do not run on; the
// page keeps itself alive with a small script written for them (`screen.js`, in ES5).
export const csr = false;
export const prerender = false;
