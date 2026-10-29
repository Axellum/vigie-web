// Activity profiles: a shortcut that says what matters first at a place (the sea for a surfer, the sky for a
// stargazer). A profile only changes the order of what the site shows; it never hides an official warning, and
// a warning in force always comes first.

export const PROFILES = ['surf', 'sea', 'mountain', 'sky', 'travel', 'allergy', 'garden', 'home'] as const;
export type Profile = (typeof PROFILES)[number];

/** The cards of a place. The tide follows the sea in every order (a page leaves it out inland); the surf spots are shown for
 *  the sea profiles only (`wantsSea`). */
export const CARDS = ['official', 'hazards', 'weather', 'surf', 'sea', 'tide', 'sky', 'air'] as const;
export type Card = (typeof CARDS)[number];

const ORDER: Record<Profile | 'none', Card[]> = {
	none: ['official', 'hazards', 'weather', 'sea', 'tide', 'sky', 'air', 'surf'],
	surf: ['surf', 'sea', 'tide', 'official', 'weather', 'hazards', 'sky', 'air'],
	sea: ['sea', 'tide', 'surf', 'official', 'weather', 'hazards', 'air', 'sky'],
	mountain: ['official', 'weather', 'hazards', 'sky', 'air', 'sea', 'tide', 'surf'],
	sky: ['sky', 'weather', 'official', 'hazards', 'air', 'sea', 'tide', 'surf'],
	travel: ['official', 'hazards', 'weather', 'air', 'sea', 'tide', 'sky', 'surf'],
	allergy: ['air', 'official', 'weather', 'hazards', 'sky', 'sea', 'tide', 'surf'],
	garden: ['weather', 'official', 'air', 'hazards', 'sky', 'sea', 'tide', 'surf'],
	home: ['official', 'hazards', 'weather', 'air', 'sky', 'sea', 'tide', 'surf']
};

export function asProfile(value: unknown): Profile | null {
	return typeof value === 'string' && (PROFILES as readonly string[]).includes(value)
		? (value as Profile)
		: null;
}

/** The cards in the order of the profile; the official card first whenever a warning is in force there. */
export function cardOrder(profile: Profile | null, warningInForce: boolean): Card[] {
	const order = ORDER[profile ?? 'none'];
	return warningInForce ? ['official', ...order.filter((c) => c !== 'official')] : order;
}

/** The profiles that want the sea: the conditions at sea are asked for them without a click. */
export function wantsSea(profile: Profile | null): boolean {
	return profile === 'surf' || profile === 'sea';
}
