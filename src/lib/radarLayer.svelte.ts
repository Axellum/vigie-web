// The rain radar of a map: the images of the last half hour, the one shown, the animation. Kept apart from the page that shows
// the map, as `tideLayer`. It asks the site for the list of images of the area in view (`/data/radar.json?area=`) only while the
// card is open and the map is on an area the radar covers, and not again before `RADAR_REFRESH_MS`: an image comes every 5
// minutes, and one request a visit is enough. The list of another area is dropped when the map moves there.
import type { Box } from './geo';
import {
	RADAR_REFRESH_MS,
	radarAreaOf,
	radarTiles,
	type Radar,
	type RadarArea,
	type RadarOnMap
} from './radar';

const RETRY_MS = 60_000;
/** The time an image stays on screen while playing, and the last one (the present) a little longer. */
const STEP_MS = 600;
const LAST_STEP_MS = 1500;

export class RadarLayer {
	/** The card is open (the rain is drawn); a reader can fold it away. */
	open = $state(true);
	#loaded = $state<{ area: RadarArea; radar: Radar } | null>(null);
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

	/** The area the map is on, close enough for the tiles: the card is shown for it (null: no card). */
	readonly area = $derived(radarAreaOf(this.#view, this.#zoom, this.#loaded?.radar.minZoom ?? 3));
	/** The map is on an area of the radar. */
	readonly covered = $derived(this.area !== null);
	/** The images of the area in view; null while they are asked, and for the images of another area. */
	readonly data = $derived(this.#loaded && this.#loaded.area === this.area ? this.#loaded.radar : null);
	/** The card has something to say or show. */
	readonly shown = $derived(
		this.covered && this.status !== 'idle' && (this.data !== null || this.status === 'failed')
	);
	/** Wants the images: asked once the map is on an area of the radar (and the card not folded away). */
	readonly wanted = $derived(this.open && this.covered);

	readonly index = $derived.by(() => {
		const frames = this.data?.frames ?? [];
		const i = this.#chosen === null ? -1 : frames.indexOf(this.#chosen);
		return i >= 0 ? i : frames.length - 1;
	});
	readonly epoch = $derived(this.data?.frames[this.index] ?? null);

	/** What the map draws (`credit`: the short credit of the radar for the map's attribution); null when nothing is to be seen. */
	onMap(credit: string): RadarOnMap | null {
		const d = this.data;
		const area = this.area;
		if (!d || !area || !this.open || this.epoch === null) return null;
		return {
			frames: d.frames.map((epoch) => ({ epoch, tiles: radarTiles(area, epoch) })),
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
		if (!this.covered) this.pause();
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
		const area = this.area;
		if (!this.wanted || area === null || this.status === 'loading') return;
		if (typeof document !== 'undefined' && document.hidden) return;
		// The images held are those of another area (or none): ask for this one now.
		if (this.#loaded?.area !== area) return void this.#load(area);
		const wait = this.status === 'failed' ? RETRY_MS : RADAR_REFRESH_MS;
		if (this.status === 'idle' || Date.now() - this.#at > wait) void this.#load(area);
	}

	async #load(area: RadarArea) {
		this.status = 'loading';
		this.#at = Date.now();
		this.#chosen = null;
		try {
			const response = await fetch(`/data/radar.json?area=${area}`);
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as Radar;
			if (!Array.isArray(body.frames) || body.frames.length === 0) throw new Error('no image');
			// An image that is no longer listed is not chosen any more: the slider goes back to the newest.
			this.#loaded = { area, radar: body };
			this.status = 'ok';
		} catch {
			const held = this.#loaded?.area === area;
			this.status = held ? 'ok' : 'failed';
			if (held) this.#at = Date.now() - RADAR_REFRESH_MS + RETRY_MS;
		}
		// The map moved to another area while the images came: ask for that one.
		if (this.area !== area) this.sync();
	}
}
