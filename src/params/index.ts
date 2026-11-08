import { defineParams } from '@sveltejs/kit/params';
// Loaded by Node at build time: a file with no runtime import of its own, and the extension written (see slugs.ts).
import { activityOfSlug } from '../lib/sea/slugs.ts';

// `/sea/surf`, `/sea/kite`, `/sea/boat`, `/sea/shore-fishing`: any other word is not an activity, so the address is a 404.
export const params = defineParams({
	activity: (param) => (activityOfSlug(param) ? param : undefined)
});
