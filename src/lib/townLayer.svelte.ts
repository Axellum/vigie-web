// The "Weather" layer of the home map: a pill for each town the base map names in view (MapView tells which), with the weather
// of the town's cell read through `/data/towns.json`, at the moment chosen in the bar under the map. On until the visitor turns
// it off; the choice stays in this browser (localStorage, never sent to the site). A town's weather is asked again after a quarter
// of an hour, as a point's; the towns of a view are asked in one request.
import { SvelteMap } from 'svelte/reactivity';
import type { TownInView, TownPill } from './townMarkers';
import {
	cellKey,
	moments,
	readAt,
	TOWNS_MIN_ZOOM,
	TOWNS_PER_REQUEST,
	type Moment,
	type TownsAnswer,
	type TownWeather
} from './townWeather';

export const TOWNS_KEY = 'vigie-towns-map';
const REFRESH_MS = 900_000;
const RETRY_MS = 60_000;

/** The stored choice; anything unreadable gives "on". */
export function parseTownsChoice(raw: string | null): boolean {
	try {
		return (JSON.parse(raw ?? '') as { on?: unknown })?.on !== false;
	} catch {
		return true;
	}
}

export class TownLayer {
	#on = $state(true);
	#zoom = $state(0);
	/** The towns the map names in view, the most important first. */
	towns = $state<TownInView[]>([]);
	/** The moment shown: an index in `moments`. */
	moment = $state(0);
	/** The weather of each cell read (null: the API could not read it), and when. */
	readonly cells = new SvelteMap<string, { weather: TownWeather | null; at: number }>();
	#loading = new Set<string>();
	/** The site's share of the day is used up: some towns have no pill. */
	paused = $state(false);
	failed = $state(false);
	attribution = $state<string | null>(null);
	/** The current minute (epoch seconds), so that "now" moves on with the page open. */
	now = $state(Math.floor(Date.now() / 1000));

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		try {
			localStorage.setItem(TOWNS_KEY, JSON.stringify({ on: value }));
		} catch {
			// a storage that refuses: the choice lasts this visit only
		}
	}

	restore() {
		try {
			this.#on = parseTownsChoice(localStorage.getItem(TOWNS_KEY));
		} catch {
			// a storage that refuses: on
		}
	}

	/** Whether the map is close enough for towns. */
	get near() {
		return this.#zoom >= TOWNS_MIN_ZOOM;
	}

	move(zoom: number) {
		this.#zoom = zoom;
	}

	readonly choices: Moment[] = $derived(moments(this.now));

	weatherOf(t: { lat: number; lon: number }): TownWeather | null {
		return this.cells.get(cellKey(t))?.weather ?? null;
	}

	/** What MapView draws: null while the layer is off. */
	readonly pills: TownPill[] | null = $derived.by(() => {
		if (!this.#on) return null;
		if (!this.near) return [];
		const m = this.choices[this.moment] ?? this.choices[0];
		return this.towns.map((t) => {
			const weather = this.weatherOf(t);
			const reading = weather ? readAt(weather, m, this.now) : null;
			return { ...t, reading, label: t.name };
		});
	});

	/** Ask the cells of the towns in view that are missing or old. Call it from an effect. */
	sync() {
		this.now = Math.floor(Date.now() / 1000);
		if (!this.#on || !this.near || (typeof document !== 'undefined' && document.hidden)) return;
		const now = Date.now();
		const due = new Map<string, { lat: number; lon: number }>();
		for (const t of this.towns) {
			const key = cellKey(t);
			if (due.has(key) || this.#loading.has(key)) continue;
			const known = this.cells.get(key);
			if (known && now - known.at < (known.weather ? REFRESH_MS : RETRY_MS)) continue;
			due.set(key, t);
		}
		const list = [...due.entries()];
		for (let i = 0; i < list.length; i += TOWNS_PER_REQUEST)
			void this.#load(list.slice(i, i + TOWNS_PER_REQUEST));
	}

	async #load(list: [string, { lat: number; lon: number }][]) {
		for (const [key] of list) this.#loading.add(key);
		try {
			const query = new URLSearchParams(list.map(([key]) => ['at', key]));
			const response = await fetch(`/data/towns.json?${query}`);
			if (!response.ok) throw new Error(String(response.status));
			const answer = (await response.json()) as TownsAnswer;
			const at = Date.now();
			for (const t of answer.towns) this.cells.set(cellKey(t), { weather: t.weather, at });
			this.paused = answer.paused;
			if (answer.attribution) this.attribution = answer.attribution;
			this.failed = false;
		} catch {
			// Asked again after a minute; what was read before stays drawn.
			const now = Date.now();
			for (const [key] of list) {
				const weather = this.cells.get(key)?.weather ?? null;
				this.cells.set(key, { weather, at: weather ? now - REFRESH_MS + RETRY_MS : now });
			}
			this.failed = true;
		} finally {
			for (const [key] of list) this.#loading.delete(key);
		}
	}
}
