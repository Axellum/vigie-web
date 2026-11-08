// The address of each activity: `/sea/<slug>`. The API's `shore_fishing` has a hyphen in the address.
// [AI-CONTEXT] No runtime import here, and the one type import has its `.ts`: `src/params/index.ts` is loaded by Node itself at
// build time (types stripped, no resolution of a bare relative path), not by Vite.
import type { ActivityId } from '../activities.ts';

export const SLUGS: Record<ActivityId, string> = {
	surf: 'surf',
	kite: 'kite',
	boat: 'boat',
	shore_fishing: 'shore-fishing'
};

export function activityOfSlug(slug: string): ActivityId | null {
	for (const [id, s] of Object.entries(SLUGS)) if (s === slug) return id as ActivityId;
	return null;
}
