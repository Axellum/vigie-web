// The forecast rain's images made ready for the map ($lib/rainField): each level drawn on canvases, a coarser one in pieces
// around the finer ones, a finer one fading into the coarser one on its edges. A new stack (another lead time, a move from Europe
// to France) is handed to the map only once all its images are loaded, so that the rain on screen stays until the next one
// replaces it, instead of vanishing while it loads; with no rain on screen yet, each level is drawn as soon as its image is
// there. An image that fails (the API restarted and has not made it again yet) is left out, and asked again a little later.
import { cutPixels, fadingEdges, featherInto, rainPieces, type RainFieldOnMap } from './rainField';

/** A piece of a level of the stack, painted: `rain-field-<level>-<n>`. */
export interface PaintedRain {
	id: string;
	canvas: HTMLCanvasElement;
	coordinates: RainFieldOnMap['coordinates'];
	/** False when the canvas holds what it held at the previous `ready` call. */
	changed: boolean;
}

/** A level's image as the map shows it, faded into the levels under it or not, and what it was made from. */
interface Level {
	source: HTMLImageElement | HTMLCanvasElement;
	width: number;
	height: number;
	bounds: RainFieldOnMap['bounds'];
	made: string;
}

/** Images kept, so that going back to a lead time already seen draws at once (3 levels x 6 lead times, and some room). */
const KEPT_IMAGES = 24;
/** A failed image is asked again after this delay. */
const RETRY_MS = 20_000;
/** A piece of a coarser image is drawn at twice its size: its pixels then stay close to the image's own. */
const PIECE_SCALE = 2;

export class RainFieldPainter {
	readonly #ready: (pieces: PaintedRain[]) => void;
	readonly #images = new Map<string, Promise<HTMLImageElement | null>>();
	readonly #canvases = new Map<string, { canvas: HTMLCanvasElement; drawn: string }>();
	/** By level: its image faded into the levels under it. */
	readonly #faded = new Map<string, { canvas: HTMLCanvasElement; made: string }>();
	#wanted = '';
	#generation = 0;
	#retry: ReturnType<typeof setTimeout> | null = null;
	/** Some rain is on the map: a new stack then waits for all its images, the rain shown staying until it is ready. */
	#shown = false;

	/** `ready` is called with the pieces to draw, the coarsest level first, each time a stack asked for is ready. */
	constructor(ready: (pieces: PaintedRain[]) => void) {
		this.#ready = ready;
	}

	/**
	 * Asks for a stack (`pickRainStack`); the same stack asked again does nothing, unless `again`: a new map style, which no
	 * longer holds the rain drawn.
	 */
	want(stack: readonly RainFieldOnMap[], again = false) {
		const key = stack.map((l) => `${l.id}|${l.bounds.join()}`).join(' ');
		if (key === this.#wanted && !again) return;
		if (again) this.#shown = false;
		this.#wanted = key;
		this.#ask(stack);
	}

	#ask(stack: readonly RainFieldOnMap[]) {
		const generation = ++this.#generation;
		if (this.#retry) clearTimeout(this.#retry);
		this.#retry = null;
		if (!stack.length) {
			this.#draw([]);
			return;
		}
		// With no rain on the map yet, each level is drawn as soon as its image is there, the finer ones over it as they come;
		// with rain on the map, it stays until the whole stack is ready.
		const early = !this.#shown;
		const images: (HTMLImageElement | null | undefined)[] = stack.map(() => undefined);
		for (const [i, layer] of stack.entries()) {
			void this.#image(layer.url).then((image) => {
				if (generation !== this.#generation) return;
				images[i] = image;
				const loaded = stack.flatMap((l, n) => (images[n] ? [{ layer: l, image: images[n] }] : []));
				if (images.includes(undefined)) {
					if (early && image) this.#draw(loaded);
					return;
				}
				if (loaded.length < stack.length) {
					this.#retry = setTimeout(() => {
						this.#retry = null;
						if (generation === this.#generation) this.#ask(stack);
					}, RETRY_MS);
				}
				this.#draw(loaded);
			});
		}
	}

	#draw(loaded: { layer: RainFieldOnMap; image: HTMLImageElement }[]) {
		const pieces: PaintedRain[] = [];
		let under: Level | null = null;
		for (const [i, { layer, image }] of loaded.entries()) {
			const level = this.#fade(layer, image, under);
			const finer = loaded.slice(i + 1).map((l) => l.layer.bounds);
			pieces.push(...this.#paint(layer, level, rainPieces(layer.bounds, finer)));
			under = level;
		}
		this.#shown = pieces.length > 0;
		this.#ready(pieces);
	}

	destroy() {
		this.#generation++;
		if (this.#retry) clearTimeout(this.#retry);
		this.#retry = null;
	}

	/**
	 * An image of the rain, loaded and decoded by the browser. Asked with a high priority: an image outside the page is asked
	 * with a low one, after the map's other data.
	 */
	#image(url: string): Promise<HTMLImageElement | null> {
		let image = this.#images.get(url);
		if (image) {
			// The most recent last, for the trimming below.
			this.#images.delete(url);
			this.#images.set(url, image);
			return image;
		}
		const element = new Image();
		element.decoding = 'async';
		element.fetchPriority = 'high';
		element.src = url;
		image = element.decode().then(
			() => element,
			() => {
				// Not kept: the next stack that needs it asks again.
				setTimeout(() => this.#images.delete(url), RETRY_MS - 1000);
				return null;
			}
		);
		this.#images.set(url, image);
		while (this.#images.size > KEPT_IMAGES) this.#images.delete(this.#images.keys().next().value!);
		return image;
	}

	/**
	 * The level's image faded into `under` (the level below it, already faded into its own) on its band: `under` drawn on the
	 * image's own pixels (both are even in longitude and in Web Mercator Y, so one stretched crop), then mixed pixel by pixel.
	 */
	#fade(layer: RainFieldOnMap, image: HTMLImageElement, under: Level | null): Level {
		const plain: Level = {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
			bounds: layer.bounds,
			made: layer.url
		};
		if (!under) return plain;
		const made = `${layer.url}<${under.made}`;
		let held = this.#faded.get(layer.level);
		if (!held) {
			held = { canvas: document.createElement('canvas'), made: '' };
			this.#faded.set(layer.level, held);
		}
		if (held.made !== made) {
			const { canvas } = held;
			const { width, height } = plain;
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return plain;
			try {
				ctx.imageSmoothingEnabled = true;
				const [x, y, w, h] = cutPixels(under.bounds, layer.bounds, under.width, under.height);
				ctx.drawImage(under.source, x, y, w, h, 0, 0, width, height);
				const coarse = ctx.getImageData(0, 0, width, height);
				ctx.clearRect(0, 0, width, height);
				ctx.drawImage(image, 0, 0);
				const fine = ctx.getImageData(0, 0, width, height);
				featherInto(fine.data, coarse.data, width, height, fadingEdges(layer.bounds, under.bounds));
				ctx.putImageData(fine, 0, 0);
			} catch {
				// Pixels that cannot be read (never seen: the images come from this site): the image as it is.
				held.made = '';
				return plain;
			}
			held.made = made;
		}
		return { ...plain, source: held.canvas, made };
	}

	#paint(layer: RainFieldOnMap, level: Level, pieces: RainFieldOnMap['bounds'][]): PaintedRain[] {
		const whole = pieces.length === 1 && pieces[0].join() === layer.bounds.join();
		return pieces.map((piece, n) => {
			const id = `rain-field-${layer.level}-${n}`;
			let held = this.#canvases.get(id);
			if (!held) {
				held = { canvas: document.createElement('canvas'), drawn: '' };
				this.#canvases.set(id, held);
			}
			const drawn = `${level.made}|${piece.join()}`;
			const changed = drawn !== held.drawn;
			if (changed) {
				const { canvas } = held;
				const [x, y, w, h] = whole
					? [0, 0, level.width, level.height]
					: cutPixels(layer.bounds, piece, level.width, level.height);
				const scale = whole ? 1 : PIECE_SCALE;
				canvas.width = Math.max(1, Math.round(w * scale));
				canvas.height = Math.max(1, Math.round(h * scale));
				const ctx = canvas.getContext('2d');
				if (ctx) {
					ctx.clearRect(0, 0, canvas.width, canvas.height);
					ctx.imageSmoothingEnabled = true;
					ctx.drawImage(level.source, x, y, w, h, 0, 0, canvas.width, canvas.height);
				}
				held.drawn = drawn;
			}
			const [west, south, east, north] = piece;
			return {
				id,
				canvas: held.canvas,
				coordinates: [
					[west, north],
					[east, north],
					[east, south],
					[west, south]
				] as RainFieldOnMap['coordinates'],
				changed
			};
		});
	}
}
