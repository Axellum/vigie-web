// The first page of an account: what the person already follows, laid out. For each place the first cards of its
// profile (the order "near me" gives it), in the medium size. The person changes it afterwards; nothing here is
// shown as a choice they made.
import { type Block, MAX_BLOCKS, newBlockId } from './pageConfig';
import { cardOrder, type Profile } from './profiles';

/** The cards a place starts with: enough to say what matters there, not the whole list. */
export const STARTER_CARDS = 3;

export function starterBlocks(places: readonly { id: string; profile: Profile | null }[]): Block[] {
	const blocks: Block[] = [];
	for (const place of places) {
		for (const type of cardOrder(place.profile, false).slice(0, STARTER_CARDS)) {
			if (blocks.length >= MAX_BLOCKS) return blocks;
			blocks.push({ id: newBlockId(), type, place: place.id, size: 'm' });
		}
	}
	return blocks;
}
