import { defineParams } from '@sveltejs/kit/params';
import { activityOfSlug } from '../lib/sea/overview';

// `/sea/surf`, `/sea/kite`, `/sea/boat`, `/sea/shore-fishing`: any other word is not an activity, so the address is a 404.
export const params = defineParams({
	activity: (param) => (activityOfSlug(param) ? param : undefined)
});
