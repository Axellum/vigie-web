// The "Forecast wind" layer of a map ($lib/windField, drawn by $lib/windFlow): off until the visitor turns it on, the choice kept in
// this browser (localStorage, never sent to the site). It asks the site for the grids of the hour (`/data/wind-field.json`) and
// loads only the images the view needs: the world (about 280 kB) always, Europe from zoom 3, France from zoom 5. An image never
// changes (its address holds its hour), so a browser keeps it; the list is asked again every 10 minutes and when the hour turns.
// While a new hour's image loads, the grid of the hour before stays drawn.
import type { Box } from './geo';
import {
	finestFirst,
	gridFromPixels,
	levelsWanted,
	type FieldGrid,
	type FieldLevel,
	type FieldLevelId,
	type WindField
} from './windField';

export const WIND_FIELD_KEY = 'vigie-wind-field';
const REFRESH_MS = 600_000;
const RETRY_MS = 60_000;

/** The stored choice; anything unreadable is "off". */
export function parseWindFieldChoice(raw: string | null): boolean {
	try {
		return (JSON.parse(raw ?? '') as { on?: unknown })?.on === true;
	} catch {
		return false;
	}
}

/** The hour (epoch seconds) a forecast for "now" is of: the whole hour nearest to `nowMs`, as the API chooses it. */
export function nearestHour(nowMs: number): number {
	return Math.round(nowMs / 3_600_000) * 3600;
}

/** The pixels of an image, as they are in the file (no colour management: they are numbers, not colours). */
async function readPixels(blob: Blob, level: FieldLevel): Promise<Uint8ClampedArray> {
	const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
	try {
		const canvas =
			typeof OffscreenCanvas !== 'undefined'
				? new OffscreenCanvas(level.width, level.height)
				: Object.assign(document.createElement('canvas'), { width: level.width, height: level.height });
		const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
			CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
		if (!ctx) throw new Error('no 2D canvas');
		ctx.drawImage(bitmap, 0, 0);
		return ctx.getImageData(0, 0, level.width, level.height).data;
	} finally {
		bitmap.close();
	}
}

export class WindFieldLayer {
	#on = $state(false);
	#view = $state<Box | null>(null);
	#zoom = $state(0);
	/** The answer of the site: the grids of the hour. */
	field = $state<WindField | null>(null);
	status = $state<'idle' | 'loading' | 'ok' | 'failed'>('idle');
	/** The grid read for each level (perhaps of the hour before, until the new image has come). */
	#grids = $state.raw<Partial<Record<FieldLevelId, FieldGrid>>>({});
	#asking = new Set<string>();
	#failedImages = new Map<string, number>();
	#at = 0;

	get on() {
		return this.#on;
	}
	set on(value: boolean) {
		this.#on = value;
		try {
			localStorage.setItem(WIND_FIELD_KEY, JSON.stringify({ on: value }));
		} catch {
			// a storage that refuses: the choice lasts this visit only
		}
	}

	/** The levels the view needs. */
	readonly wanted = $derived(this.#on ? levelsWanted(this.field, this.#view, this.#zoom) : []);

	/** What the map draws, the finest first; null when nothing is to be drawn. */
	readonly grids = $derived.by<FieldGrid[] | null>(() => {
		if (!this.#on) return null;
		const held = this.wanted.map((l) => this.#grids[l.id]).filter((g): g is FieldGrid => g !== undefined);
		return held.length ? finestFirst(held) : null;
	});

	/** The hour of the forecast drawn (epoch seconds), for the legend. */
	readonly valid = $derived(this.field?.status === 'ok' ? this.field.valid : null);

	restore() {
		try {
			this.#on = parseWindFieldChoice(localStorage.getItem(WIND_FIELD_KEY));
		} catch {
			// a storage that refuses: off
		}
	}

	move(view: Box | null, zoom: number) {
		this.#view = view;
		this.#zoom = zoom;
	}

	/** Ask the list when it is missing, old, or of another hour, then the images the view needs. Call it from an effect and a timer. */
	sync() {
		if (!this.#on || this.status === 'loading') return;
		if (typeof document !== 'undefined' && document.hidden) return;
		const now = Date.now();
		const age = now - this.#at;
		const otherHour = this.field?.valid != null && this.field.valid !== nearestHour(now);
		if (
			this.status === 'idle' ||
			(this.status === 'failed' && age > RETRY_MS) ||
			(this.status === 'ok' && (age > REFRESH_MS || (otherHour && age > RETRY_MS)))
		)
			return void this.#loadList();
		for (const level of this.wanted) {
			if (this.#grids[level.id]?.image === level.image || this.#asking.has(level.image)) continue;
			if (now - (this.#failedImages.get(level.image) ?? -Infinity) < RETRY_MS) continue;
			void this.#loadImage(level);
		}
	}

	async #loadList() {
		this.status = 'loading';
		this.#at = Date.now();
		try {
			const response = await fetch('/data/wind-field.json');
			if (!response.ok) throw new Error(String(response.status));
			this.field = (await response.json()) as WindField;
			this.status = 'ok';
		} catch {
			// The list held (an earlier answer) stays drawn.
			this.status = this.field ? 'ok' : 'failed';
		}
		this.sync();
	}

	async #loadImage(level: FieldLevel) {
		this.#asking.add(level.image);
		try {
			const response = await fetch(level.image);
			// An image the site no longer lists (the hour turned): the list is asked again.
			if (response.status === 404) this.#at = 0;
			if (!response.ok) throw new Error(String(response.status));
			const grid = gridFromPixels(level, await readPixels(await response.blob(), level));
			this.#grids = { ...this.#grids, [level.id]: grid };
			this.#failedImages.delete(level.image);
		} catch {
			this.#failedImages.set(level.image, Date.now());
		} finally {
			this.#asking.delete(level.image);
		}
	}
}
