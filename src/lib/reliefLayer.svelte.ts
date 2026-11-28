// The "Relief" layer of a map ($lib/relief): on until the visitor turns it off, the contour lines off until they are ticked.
// Both choices stay in this browser (localStorage, never sent to the site), so that the next visit opens the map as it was left.
import { parseReliefChoice, type ReliefOnMap } from './relief';

export const RELIEF_KEY = 'vigie-relief-map';

export class ReliefLayer {
	#on = $state(true);
	#contours = $state(false);

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		this.#save();
	}
	get contours() {
		return this.#contours;
	}
	set contours(value: boolean) {
		this.#contours = value;
		this.#save();
	}

	/** How many of its layers are shown (the relief, and the contour lines over it). */
	readonly count = $derived(Number(this.#on) + Number(this.#on && this.#contours));

	/** What the map draws: null when the relief is off. */
	onMap(credit: string): ReliefOnMap | null {
		return this.#on ? { contours: this.#contours, credit } : null;
	}

	/** Read the stored choice (once the page is shown in the browser). */
	restore() {
		try {
			const c = parseReliefChoice(localStorage.getItem(RELIEF_KEY));
			this.#on = c.on;
			this.#contours = c.contours;
		} catch {
			// a storage that refuses: the default, asked again next time
		}
	}

	#save() {
		try {
			localStorage.setItem(RELIEF_KEY, JSON.stringify({ on: this.#on, contours: this.#contours }));
		} catch {
			// a storage that refuses: the choice lasts this visit only
		}
	}
}
