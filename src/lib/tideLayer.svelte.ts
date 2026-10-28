// The "Tides" layer of a map: the tiles of the tide now along the coasts ($lib/tides), loaded from `/data/tides/...` for the view,
// asked again every few minutes (the tide moves), kept apart from the page that shows the map.
import { SvelteMap } from 'svelte/reactivity';
import type { Feature, FeatureCollection } from 'geojson';
import type { Box } from './geo';
import { tideLevel, tideTilesInView, type TideTile } from './tides';

/** A tile is asked again after this delay: the API's answer holds for five minutes. */
const REFRESH_MS = 300_000;
const RETRY_MS = 60_000;

type TileState = { status: 'loading' | 'ok' | 'error'; value?: TideTile; at: number };

export class TideLayer {
	on = $state(false);
	#view = $state<Box | null>(null);
	#zoom = $state(0);
	#tiles = new SvelteMap<string, TileState>();

	/** The tiles of the view, or null when the map is too far out to ask for them. */
	readonly keys = $derived.by((): string[] | null => {
		if (!this.on || !this.#view) return [];
		const level = tideLevel(this.#zoom);
		if (this.#zoom < level.fromZoom) return null;
		const tiles = tideTilesInView(level, this.#view);
		return tiles ? tiles.map(([x, y]) => `${level.id}/${x}_${y}`) : null;
	});

	readonly features = $derived.by((): FeatureCollection | null => {
		if (!this.on) return null;
		const features: Feature[] = [];
		for (const key of this.keys ?? []) {
			const tile = this.#tiles.get(key);
			if (tile?.value) features.push(...tile.value.features.features);
		}
		return { type: 'FeatureCollection', features };
	});

	readonly tooFar = $derived(this.on && this.keys === null);
	readonly failed = $derived((this.keys ?? []).some((key) => this.#tiles.get(key)?.status === 'error'));
	readonly attribution = $derived(
		(this.keys ?? []).map((key) => this.#tiles.get(key)?.value?.attribution).find((a) => a) ?? null
	);

	/** The map moved: load what the new view needs. */
	move(view: Box | null, zoom: number) {
		this.#view = view;
		this.#zoom = zoom;
	}

	/** Load the tiles of the view that are missing or old. Call it from an effect of the page. */
	sync() {
		const now = Date.now();
		for (const key of this.keys ?? []) {
			const known = this.#tiles.get(key);
			const wait = known?.status === 'error' ? RETRY_MS : REFRESH_MS;
			if (!known || (known.status !== 'loading' && now - known.at > wait)) void this.#load(key);
		}
	}

	async #load(key: string) {
		this.#tiles.set(key, { status: 'loading', value: this.#tiles.get(key)?.value, at: Date.now() });
		try {
			const response = await fetch(`/data/tides/${key}.json`);
			if (!response.ok) throw new Error(String(response.status));
			this.#tiles.set(key, { status: 'ok', value: (await response.json()) as TideTile, at: Date.now() });
		} catch {
			this.#tiles.set(key, { status: 'error', value: this.#tiles.get(key)?.value, at: Date.now() });
		}
	}
}
