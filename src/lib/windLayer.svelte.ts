// The "Wind" layer of a map: the wind measured now by the stations and buoys of the view ($lib/wind), off until the visitor
// turns it on. Whether it is on and the unit (km/h or knots) stay in this browser (localStorage, never sent to the site), so
// that the next visit opens the map as it was left. The view's list is asked again when the map leaves the box already read,
// and every `REFRESH_MS` while it is on (a new observation comes every 6 minutes).
import type { Box } from './geo';
import type { WindUnit } from './sea/choice';
import { windQueryBox, type WindMap } from './wind';

export const WIND_KEY = 'vigie-wind-map';
const REFRESH_MS = 360_000;
const RETRY_MS = 60_000;

/** The stored choice; anything unreadable gives "off, km/h". */
export function parseWindChoice(raw: string | null): { on: boolean; unit: WindUnit } {
	try {
		const v = JSON.parse(raw ?? '') as { on?: unknown; unit?: unknown };
		return { on: v?.on === true, unit: v?.unit === 'kn' ? 'kn' : 'kmh' };
	} catch {
		return { on: false, unit: 'kmh' };
	}
}

const contains = (outer: Box, inner: Box) =>
	outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

export class WindLayer {
	#on = $state(false);
	#unit = $state<WindUnit>('kmh');
	#view = $state<Box | null>(null);
	#zoom = $state(0);
	#loaded = $state<{ box: Box; map: WindMap; at: number } | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	#failedAt = 0;

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		this.#save();
	}
	get unit() {
		return this.#unit;
	}
	set unit(value: WindUnit) {
		this.#unit = value;
		this.#save();
	}
	get zoom() {
		return this.#zoom;
	}

	/** What was read for the view (the points of a wider box: the map shows those on screen). */
	readonly data = $derived(this.#on ? (this.#loaded?.map ?? null) : null);

	/** Read the stored choice (once the page is shown in the browser). */
	restore() {
		try {
			const c = parseWindChoice(localStorage.getItem(WIND_KEY));
			this.#on = c.on;
			this.#unit = c.unit;
		} catch {
			// a storage that refuses: off, km/h, asked again next time
		}
	}

	#save() {
		try {
			localStorage.setItem(WIND_KEY, JSON.stringify({ on: this.#on, unit: this.#unit }));
		} catch {
			// a storage that refuses: the choice lasts this visit only
		}
	}

	move(view: Box | null, zoom: number) {
		this.#view = view;
		this.#zoom = zoom;
	}

	/** Ask the view's list when it is missing, when the map left the box read, or when it is old. Call it from an effect. */
	sync() {
		if (!this.#on || !this.#view || this.status === 'loading') return;
		const now = Date.now();
		if (this.status === 'failed' && now - this.#failedAt < RETRY_MS) return;
		const loaded = this.#loaded;
		if (loaded && contains(loaded.box, this.#view) && now - loaded.at < REFRESH_MS) return;
		void this.#load(windQueryBox(this.#view));
	}

	async #load(box: Box) {
		this.status = 'loading';
		try {
			const response = await fetch(`/data/wind.json?bbox=${box.join(',')}`);
			if (!response.ok) throw new Error(String(response.status));
			this.#loaded = { box, map: (await response.json()) as WindMap, at: Date.now() };
			this.status = 'ok';
		} catch {
			this.status = 'failed';
			this.#failedAt = Date.now();
		}
	}
}
