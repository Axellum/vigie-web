// The rain radar of a map: the images of the last half hour, plus optional PIAF +1h forecast frames on France, the one shown,
// and the animation. Kept apart from the page that shows the map, as `tideLayer`. It asks the site for the list of images of
// the area in view (`/data/radar.json?area=`) only while the card is open and the map is on an area the radar covers, and not
// again before `RADAR_REFRESH_MS`: an image comes every 5 minutes, and one request a visit is enough. The list of another area
// is dropped when the map moves there.
import type { Box } from './geo';
import {
	RADAR_REFRESH_MS,
	radarAreaOf,
	radarNowcastTiles,
	radarTiles,
	type Radar,
	type RadarArea,
	type RadarNowcast,
	type RadarOnMap,
	type RadarTimelineFrame
} from './radar';

const RETRY_MS = 60_000;
/** The time an image stays on screen while playing, and the present/last one a little longer. */
const STEP_MS = 600;
const LAST_STEP_MS = 1500;

export class RadarLayer {
	/** The card is open (the rain is drawn); a reader can fold it away. */
	open = $state(true);
	#loaded = $state<{ area: RadarArea; radar: Radar; nowcast: RadarNowcast | null } | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	/** The image chosen with the slider or by the animation; null follows the newest observed frame. */
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
	/** The observed images of the area in view; null while they are asked, and for the images of another area. */
	readonly data = $derived(this.#loaded && this.#loaded.area === this.area ? this.#loaded.radar : null);
	/** Optional PIAF +1h rain nowcast frames (France only); null when absent or on another area. */
	readonly nowcast = $derived(this.#loaded && this.#loaded.area === this.area ? this.#loaded.nowcast : null);
	/** Combined chronological timeline: observed radar frames first, followed by PIAF +5..+60 min forecast frames. */
	readonly timeline = $derived.by<RadarTimelineFrame[]>(() => {
		const d = this.data;
		if (!d) return [];
		const obs: RadarTimelineFrame[] = d.frames.map((epoch) => ({
			epoch,
			kind: 'observed',
			leadMinutes: null
		}));
		const lastObs = d.frames.at(-1) ?? 0;
		const fc: RadarTimelineFrame[] = (this.nowcast?.frames ?? [])
			.filter((f) => f.epoch > lastObs)
			.map((f) => ({ epoch: f.epoch, kind: 'nowcast', leadMinutes: f.leadMinutes }));
		return [...obs, ...fc];
	});
	readonly observedCount = $derived(this.data?.frames.length ?? 0);
	readonly hasNowcast = $derived(this.timeline.length > this.observedCount);
	readonly nowcastAttribution = $derived(this.hasNowcast ? (this.nowcast?.attribution ?? null) : null);

	/** The card has something to say or show. */
	readonly shown = $derived(
		this.covered && this.status !== 'idle' && (this.data !== null || this.status === 'failed')
	);
	/** Wants the images: asked once the map is on an area of the radar (and the card not folded away). */
	readonly wanted = $derived(this.open && this.covered);

	readonly index = $derived.by(() => {
		const list = this.timeline;
		if (list.length === 0) return -1;
		if (this.#chosen !== null) {
			const i = list.findIndex((f) => f.epoch === this.#chosen);
			if (i >= 0) return i;
		}
		// Default to the newest observed frame ("Now"), not the +60 min forecast.
		return Math.max(0, this.observedCount - 1);
	});
	readonly activeFrame = $derived<RadarTimelineFrame | null>(
		this.index >= 0 ? (this.timeline[this.index] ?? null) : null
	);
	readonly epoch = $derived(this.activeFrame?.epoch ?? null);

	/** What the map draws (`credit`: the short credit of the radar for the map's attribution); null when nothing is to be seen. */
	onMap(credit: string): RadarOnMap | null {
		const d = this.data;
		const nc = this.nowcast;
		const area = this.area;
		if (!d || !area || !this.open || this.epoch === null) return null;
		return {
			frames: this.timeline.map((f) =>
				f.kind === 'nowcast' && nc
					? {
							epoch: f.epoch,
							tiles: radarNowcastTiles(f.epoch),
							kind: 'nowcast',
							bounds: nc.bounds,
							minZoom: nc.minZoom,
							maxZoom: nc.maxZoom
						}
					: {
							epoch: f.epoch,
							tiles: radarTiles(area, f.epoch),
							kind: 'observed'
						}
			),
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
		const list = this.timeline;
		const picked = list[Math.max(0, Math.min(list.length - 1, index))];
		this.#chosen = picked?.epoch ?? null;
		this.preload = true;
	}

	toggle() {
		if (this.playing) return this.pause();
		const list = this.timeline;
		if (list.length < 2) return;
		this.preload = true;
		this.playing = true;
		// From the default latest observed frame or the very last frame, play sweeps from the oldest observed frame.
		if (this.index === list.length - 1 || this.#chosen === null) this.#chosen = list[0].epoch;
		this.#tick();
	}

	pause() {
		this.playing = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}

	#tick() {
		const list = this.timeline;
		const pauseHere =
			this.index === list.length - 1 || (this.hasNowcast && this.index === this.observedCount - 1);
		this.#timer = setTimeout(
			() => {
				if (!this.playing || list.length === 0) return;
				this.#chosen = list[(this.index + 1) % list.length].epoch;
				this.#tick();
			},
			pauseHere ? LAST_STEP_MS : STEP_MS
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

	async #loadNowcast(): Promise<RadarNowcast | null> {
		try {
			const response = await fetch('/data/radar/france/nowcast');
			if (!response.ok) return null;
			const body = (await response.json()) as RadarNowcast;
			return Array.isArray(body.frames) && body.frames.length > 0 ? body : null;
		} catch {
			return null;
		}
	}

	async #load(area: RadarArea) {
		this.status = 'loading';
		this.#at = Date.now();
		this.#chosen = null;
		try {
			const [radarRes, nowcast] = await Promise.all([
				fetch(`/data/radar.json?area=${area}`),
				area === 'france' ? this.#loadNowcast() : Promise.resolve(null)
			]);
			if (!radarRes.ok) throw new Error(String(radarRes.status));
			const body = (await radarRes.json()) as Radar;
			if (!Array.isArray(body.frames) || body.frames.length === 0) throw new Error('no image');
			// An image that is no longer listed is not chosen any more: the slider goes back to the newest observed.
			this.#loaded = { area, radar: body, nowcast };
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
