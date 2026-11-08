import script from '../../../lib/tv/screen.es5.js?raw';
import type { RequestHandler } from './$types';

// The script of the screen, as written (ES5, no build step: a television of 2018 reads it as it is). The address carries the version of
// the site, so that a new version is a new address and the old one can be kept for good.
export const GET: RequestHandler = () =>
	new Response(script, {
		headers: {
			'content-type': 'text/javascript; charset=utf-8',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
