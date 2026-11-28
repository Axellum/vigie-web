// The IGN's layers of a map ($lib/ign), the "Carte" family: the relief on until the visitor turns it off, its contour lines
// off until they are ticked, the aerial photo off, the details of the BD TOPO (foreshores, beaches, ski lifts) on. The choices
// stay in this browser (localStorage, never sent to the site), so that the next visit opens the map as it was left.
import type { PhotoOnMap } from './aerialPhoto';
import { IGN_DEFAULT, parseIgnChoice, type IgnChoice } from './ign';
import type { DetailsOnMap } from './mapDetails';
import type { ReliefOnMap } from './relief';

/** The key keeps the name it had when the relief was the only IGN layer: the choices stored then stay read. */
export const IGN_KEY = 'vigie-relief-map';

export class IgnLayers {
	#choice = $state<IgnChoice>({ ...IGN_DEFAULT });

	/** The relief. */
	get on() {
		return this.#choice.on;
	}
	set on(v: boolean) {
		this.#set({ on: v });
	}
	get contours() {
		return this.#choice.contours;
	}
	set contours(v: boolean) {
		this.#set({ contours: v });
	}
	get photo() {
		return this.#choice.photo;
	}
	set photo(v: boolean) {
		this.#set({ photo: v });
	}
	get details() {
		return this.#choice.details;
	}
	set details(v: boolean) {
		this.#set({ details: v });
	}

	/** How many layers of the family are drawn (the contour lines only with the relief). */
	readonly count = $derived(
		Number(this.#choice.on) +
			Number(this.#choice.on && this.#choice.contours) +
			Number(this.#choice.photo) +
			Number(this.#choice.details)
	);

	reliefOnMap(credit: string): ReliefOnMap | null {
		return this.#choice.on ? { contours: this.#choice.contours, credit } : null;
	}

	photoOnMap(credit: string): PhotoOnMap | null {
		return this.#choice.photo ? { credit } : null;
	}

	detailsOnMap(credit: string, lifts: DetailsOnMap['lifts']): DetailsOnMap | null {
		return this.#choice.details ? { credit, lifts } : null;
	}

	restore() {
		try {
			this.#choice = parseIgnChoice(localStorage.getItem(IGN_KEY));
		} catch {
			// Storage off: the defaults stay.
		}
	}

	#set(change: Partial<IgnChoice>) {
		this.#choice = { ...this.#choice, ...change };
		try {
			localStorage.setItem(IGN_KEY, JSON.stringify(this.#choice));
		} catch {
			// Storage off or full: the choice lasts as long as the page.
		}
	}
}
