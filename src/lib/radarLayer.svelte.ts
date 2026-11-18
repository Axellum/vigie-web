// The rain radar of a map: the images of the last half hour, the one shown, the animation. Kept apart from the page that shows
// the map, as `tideLayer`. It asks the site for the list of images (`/data/radar.json`) only while the card is open and the map
// is on France, and not again before `RADAR_REFRESH_MS`: an image comes every 5 minutes, and one request a visit is enough.
import type { Box } from './geo';
import { RADAR_REFRESH_MS, radarInView, radarTiles, type Radar, type RadarOnMap } from './radar';

const RETRY_MS = 60_000;
/** The time an image stays on screen while playing, and the last one (the present) a little longer. */
const STEP_MS = 600;
const LAST_STEP_MS = 1500;

export class RadarLayer {
	/** The card is open (the rain is drawn); a reader can fold it away. */
	open = $state(true);
	data = $state<Radar | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	/** The image chosen with the slider or by the animation; null follows the newest. */
	#chosen = $state<number | null>(null);
	/** Set at the first press of Play or touch of the slider: from then on every image is loaded. */
	preload = $state(false);
	playing = $state(false);
	#view = $state<Box | null>(null);
	#zoom = $state(0);
	#at = 0;
	#timer: ReturnType<typeof setTimeout> | null = null;

	/** The map is on France, close enough for the tiles: the card is shown. */
	readonly inFrance = $derived(radarInView(this.#view, this.#zoom, this.data?.minZoom ?? 3));
	/** The card has something to say or show. */
	readonly shown = $derived(
		this.inFrance && this.status !== 'idle' && (this.data !== null || this.status === 'failed')
	);
	/** Wants the images: asked once the map is on France (and the card not folded away). */
	readonly wanted = $derived(this.open && this.inFrance);

	readonly index = $derived.by(() => {
		const frames = this.data?.frames ?? [];
		const i = this.#chosen === null ? -1 : frames.indexOf(this.#chosen);
		return i >= 0 ? i : frames.length - 1;
	});
	readonly epoch = $derived(this.data?.frames[this.index] ?? null);

	/** What the map draws (`credit`: the short credit of the radar for the map's attribution); null when nothing is to be seen. */
	onMap(credit: string): RadarOnMap | null {
		const d = this.data;
		if (!d || !this.open || !this.inFrance || this.epoch === null) return null;
		return {
			frames: d.frames.map((epoch) => ({ epoch, tiles: radarTiles(epoch) })),
			active: this.epoch,
			preload: this.preload,
			minZoom: d.minZoom,
			maxZoom: d.maxZoom,
			bounds: d.bounds,
			attribution: credit
		};
	}

	move(view: Box | null, zoom: number) {
		this.#view = view;
		this.#zoom = zoom;
		if (!this.inFrance) this.pause();
	}

	choose(index: number) {
		const frames = this.data?.frames ?? [];
		this.#chosen = frames[Math.max(0, Math.min(frames.length - 1, index))] ?? null;
		this.preload = true;
	}

	toggle() {
		if (this.playing) return this.pause();
		const frames = this.data?.frames ?? [];
		if (frames.length < 2) return;
		this.preload = true;
		this.playing = true;
		// From the newest image, play starts again from the oldest.
		if (this.index === frames.length - 1) this.#chosen = frames[0];
		this.#tick();
	}

	pause() {
		this.playing = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	#tick() {
		const frames = this.data?.frames ?? [];
		this.#timer = setTimeout(
			() => {
				if (!this.playing || frames.length === 0) return;
				this.#chosen = frames[(this.index + 1) % frames.length];
				this.#tick();
			},
			this.index === frames.length - 1 ? LAST_STEP_MS : STEP_MS
		);
	}

	/** Load the list of images when it is missing or old. Call it from an effect of the page, and from a timer. */
	sync() {
		if (!this.wanted || this.status === 'loading') return;
		if (typeof document !== 'undefined' && document.hidden) return;
		const wait = this.status === 'failed' ? RETRY_MS : RADAR_REFRESH_MS;
		if (this.status === 'idle' || Date.now() - this.#at > wait) void this.#load();
	}

	async #load() {
		this.status = 'loading';
		this.#at = Date.now();
		try {
			const response = await fetch('/data/radar.json');
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as Radar;
			if (!Array.isArray(body.frames) || body.frames.length === 0) throw new Error('no image');
			// An image that is no longer listed is not chosen any more: the slider goes back to the newest.
			this.data = body;
			this.status = 'ok';
		} catch {
			this.status = this.data ? 'ok' : 'failed';
			if (this.data) this.#at = Date.now() - RADAR_REFRESH_MS + RETRY_MS;
		}
	}
}
