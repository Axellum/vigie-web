// The forecast wind drawn on a map ($lib/windField): thin trails that follow the wind, on a canvas laid over MapLibre's and under
// its markers and popups (they come after it in the page), with nothing to click. About 30 images a second while the page is
// shown; each trail lives 1.5 to 3.5 seconds, then starts again at a random place of the screen, so that the density stays even.
// A trail is a short line through the last positions of its head, fainter with age, drawn again whole at each image: nothing is
// left behind on the canvas. While the map moves the canvas is empty (no trail lags behind the base map), and the trails grow
// again from where they are once it stops. With "reduce motion", the trails are drawn once, still, and again after each move.
// The segments are drawn by the graphics card ($lib/windFlowGl); a browser without WebGL 2 strokes them on a 2D canvas, as
// before, which costs much more on a large screen.
import type { Map as MlMap } from 'maplibre-gl';
import { FLOW_PX_PER_S, flowAlpha, flowClass, flowCount, sampleWind, type FieldGrid } from './windField';
import { SEGMENT_FLOATS, TrailPainter } from './windFlowGl';

/** Positions kept per trail: at 30 images a second, 0.4 s of its way. */
const HISTORY = 12;
const FRAME_MS = 1000 / 30;
const LIFE_MIN = 45;
const LIFE_SPREAD = 60;
/** On a 2D canvas, opacities are drawn in this many steps (one stroke per step and colour, not one per segment). */
const ALPHA_STEPS = 6;
const ALPHA_MAX = 0.66;
/** The width of a trail in CSS pixels: the quiet ink, then the colours of a strong wind. */
const WIDTHS: [number, number] = [1.1, 1.5];
const MAX_DPR = 2;
const DEG = Math.PI / 180;
/** In globe view, a trail further than about 75° from the centre is on the edge of the Earth: it starts again elsewhere. */
const GLOBE_COS_LIMIT = 0.25;

export interface FlowColors {
	/** The quiet ink of most of the wind, then the colours of 40 and 60 km/h and more. */
	quiet: string;
	strong: string;
	stronger: string;
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export class WindFlow {
	readonly #map: MlMap;
	readonly #canvas: HTMLCanvasElement;
	/** The graphics card's painter, or the 2D context of a browser without WebGL 2: one of the two. */
	readonly #painter: TrailPainter | null;
	readonly #ctx: CanvasRenderingContext2D | null;
	readonly #still: boolean;
	#colors: FlowColors;
	#grids: FieldGrid[] = [];
	#n = 0;
	#lon = new Float64Array(0);
	#lat = new Float64Array(0);
	#speed = new Float32Array(0);
	#age = new Uint16Array(0);
	#life = new Uint16Array(0);
	#hx = new Float32Array(0);
	#hy = new Float32Array(0);
	#len = new Uint8Array(0);
	#head = new Uint8Array(0);
	/** The segments of an image, as the painter takes them. */
	#segments = new Float32Array(0);
	#w = 0;
	#h = 0;
	#raf = 0;
	#last = 0;
	#moving = false;
	#wind = new Float32Array(2);
	readonly #onMoveStart = () => {
		this.#moving = true;
		this.#clear();
	};
	readonly #onMoveEnd = () => {
		this.#moving = false;
		this.#len.fill(0);
		if (this.#still) this.#drawStill();
	};
	readonly #onResize = () => {
		this.#resize();
		if (this.#still) this.#drawStill();
	};

	constructor(map: MlMap, colors: FlowColors, still: boolean) {
		this.#map = map;
		this.#colors = colors;
		this.#still = still;
		const blank = () => {
			const canvas = document.createElement('canvas');
			canvas.className = 'vigie-flow';
			canvas.setAttribute('aria-hidden', 'true');
			canvas.dataset.testid = 'wind-flow';
			return canvas;
		};
		// A context the browser took back (memory, a long hidden tab) comes back blank, without its scale.
		let canvas = blank();
		this.#painter = TrailPainter.make(canvas, this.#onResize);
		if (this.#painter) {
			this.#ctx = null;
			this.#painter.look([colors.quiet, colors.strong, colors.stronger], WIDTHS);
		} else {
			// A canvas that was asked for WebGL gives no 2D context: another one.
			canvas = blank();
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('no canvas to draw the wind on');
			this.#ctx = ctx;
			canvas.addEventListener('contextrestored', this.#onResize);
		}
		this.#canvas = canvas;
		// Right after the map's own canvas, in the same container as the markers: what lies over or under the trails is
		// set by z-index (MapView: the warnings' markers under, the measured wind's badges and their card over).
		map.getCanvas().after(this.#canvas);
		map.on('movestart', this.#onMoveStart);
		map.on('moveend', this.#onMoveEnd);
		map.on('resize', this.#onResize);
		this.#moving = map.isMoving();
		this.#resize();
		if (!still) this.#raf = requestAnimationFrame(this.#frame);
	}

	/** The grids to follow, the finest first; none: an empty canvas. The same grids again (the map moved): nothing changes. */
	setGrids(grids: FieldGrid[]) {
		const same = grids.length === this.#grids.length && grids.every((g, i) => g === this.#grids[i]);
		this.#grids = grids;
		if (same) return;
		this.#age.set(this.#life); // every trail starts again on the new wind
		this.#len.fill(0);
		if (this.#still) this.#drawStill();
		else if (!grids.length) this.#clear();
	}

	recolor(colors: FlowColors) {
		this.#colors = colors;
		this.#painter?.look([colors.quiet, colors.strong, colors.stronger], WIDTHS);
		if (this.#still) this.#drawStill();
	}

	destroy() {
		cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.#map.off('movestart', this.#onMoveStart);
		this.#map.off('moveend', this.#onMoveEnd);
		this.#map.off('resize', this.#onResize);
		this.#painter?.destroy();
		this.#canvas.remove();
	}

	#resize() {
		const box = this.#map.getContainer();
		const w = box.clientWidth;
		const h = box.clientHeight;
		const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
		this.#w = w;
		this.#h = h;
		this.#canvas.width = Math.max(1, Math.round(w * dpr));
		this.#canvas.height = Math.max(1, Math.round(h * dpr));
		this.#painter?.resize(w, h, dpr);
		this.#ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		const n = flowCount(w, h);
		if (n === this.#n) return;
		this.#n = n;
		this.#lon = new Float64Array(n);
		this.#lat = new Float64Array(n);
		this.#speed = new Float32Array(n);
		this.#age = new Uint16Array(n);
		this.#life = new Uint16Array(n); // all at 0: each trail is placed at the first image
		this.#hx = new Float32Array(n * HISTORY);
		this.#hy = new Float32Array(n * HISTORY);
		this.#len = new Uint8Array(n);
		this.#head = new Uint8Array(n);
		if (this.#painter) this.#segments = new Float32Array(n * (HISTORY - 1) * SEGMENT_FLOATS);
	}

	#clear() {
		this.#painter?.clear();
		this.#ctx?.clearRect(0, 0, this.#w, this.#h);
	}

	readonly #frame = (now: number) => {
		this.#raf = requestAnimationFrame(this.#frame);
		if (now - this.#last < FRAME_MS - 2) return;
		const dt = Math.min(0.1, (now - this.#last) / 1000);
		this.#last = now;
		// A move whose end was not heard (a camera stopped in the middle) does not keep the canvas empty.
		if (this.#moving && !this.#map.isMoving()) this.#onMoveEnd();
		if (this.#moving || !this.#grids.length || this.#w < 2 || this.#h < 2) return;
		this.#step(dt);
		this.#draw();
	};

	/** Trails drawn once, still: each walks its whole length from a random place. */
	#drawStill() {
		this.#clear();
		if (this.#moving || !this.#grids.length || this.#w < 2) return;
		for (let i = 0; i < this.#n; i++) this.#place(i);
		for (let k = 0; k < HISTORY; k++) this.#step(FRAME_MS / 1000, false);
		this.#draw();
	}

	/** A new start for trail `i`, at a random place of the screen where the model has a wind; false when none was found. */
	#place(i: number): boolean {
		// The first trails of a screen do not all end together: a trail never placed starts somewhere in its life.
		const spread = !this.#still && this.#life[i] === 0;
		const globe = this.#map.getProjection()?.type === 'globe';
		for (let attempt = 0; attempt < 4; attempt++) {
			const x = Math.random() * this.#w;
			const y = Math.random() * this.#h;
			const at = this.#map.unproject([x, y]);
			if (!Number.isFinite(at.lat) || Math.abs(at.lat) > 85) continue;
			if (globe) {
				// Off the globe, the point found is not the one under the pixel.
				const back = this.#map.project(at);
				if (Math.abs(back.x - x) + Math.abs(back.y - y) > 2) continue;
			}
			if (!sampleWind(this.#grids, wrapLon(at.lng), at.lat, this.#wind)) continue;
			this.#lon[i] = at.lng;
			this.#lat[i] = at.lat;
			this.#speed[i] = Math.hypot(this.#wind[0], this.#wind[1]);
			this.#life[i] = LIFE_MIN + Math.floor(Math.random() * LIFE_SPREAD);
			this.#age[i] = spread ? Math.floor(Math.random() * this.#life[i]) : 0;
			this.#len[i] = 0;
			this.#push(i, x, y);
			return true;
		}
		this.#len[i] = 0;
		this.#life[i] = 1;
		this.#age[i] = 1;
		return false;
	}

	#push(i: number, x: number, y: number) {
		const head = (this.#head[i] + 1) % HISTORY;
		this.#head[i] = head;
		this.#hx[i * HISTORY + head] = x;
		this.#hy[i * HISTORY + head] = y;
		if (this.#len[i] < HISTORY) this.#len[i]++;
	}

	/** Every head moves with the wind of its place for `dt` seconds: the same speed on screen at every zoom. */
	#step(dt: number, respawn = true) {
		const map = this.#map;
		const globe = map.getProjection()?.type === 'globe';
		const center = map.getCenter();
		const cosC = Math.cos(center.lat * DEG);
		const sinC = Math.sin(center.lat * DEG);
		// Degrees per pixel along a parallel at the equator in Mercator (tiles of 512 pixels).
		const f = (FLOW_PX_PER_S * dt * 360) / (512 * 2 ** map.getZoom());
		const w = this.#w;
		const h = this.#h;
		for (let i = 0; i < this.#n; i++) {
			if (this.#age[i] >= this.#life[i]) {
				if (respawn) this.#place(i);
				continue;
			}
			const lat = this.#lat[i];
			if (!sampleWind(this.#grids, wrapLon(this.#lon[i]), lat, this.#wind)) {
				this.#age[i] = this.#life[i];
				this.#len[i] = 0;
				continue;
			}
			const u = this.#wind[0];
			const v = this.#wind[1];
			this.#speed[i] = Math.hypot(u, v);
			const cosLat = Math.max(0.05, Math.cos(lat * DEG));
			// A pixel is the same length both ways: in Mercator a degree of latitude spans 1/cos(lat) pixels of one of longitude;
			// on the globe (scaled as Mercator at its centre), a degree of longitude spans cos(lat)/cos(centre).
			const lon = globe ? this.#lon[i] + (u * f * cosC) / cosLat : this.#lon[i] + u * f;
			const next = globe ? lat + v * f * cosC : lat + v * f * cosLat;
			this.#age[i]++;
			if (Math.abs(next) > 85) {
				this.#age[i] = this.#life[i];
				continue;
			}
			if (globe) {
				const cosD =
					Math.sin(next * DEG) * sinC + Math.cos(next * DEG) * cosC * Math.cos((lon - center.lng) * DEG);
				if (cosD < GLOBE_COS_LIMIT) {
					this.#age[i] = this.#life[i];
					continue;
				}
			}
			this.#lon[i] = lon;
			this.#lat[i] = next;
			const p = map.project([lon, next]);
			if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) {
				this.#age[i] = this.#life[i];
				continue;
			}
			this.#push(i, p.x, p.y);
		}
	}

	#draw() {
		if (this.#painter) this.#drawSegments(this.#painter);
		else if (this.#ctx) this.#stroke(this.#ctx);
	}

	/** Every segment of every trail in one list for the graphics card, its opacity running evenly from head to tail. */
	#drawSegments(painter: TrailPainter) {
		const out = this.#segments;
		let m = 0;
		for (let i = 0; i < this.#n; i++) {
			const len = this.#len[i];
			if (len < 2) continue;
			const speed = this.#speed[i];
			const base = flowAlpha(speed);
			const ink = flowClass(speed);
			let at = this.#head[i];
			let x = this.#hx[i * HISTORY + at];
			let y = this.#hy[i * HISTORY + at];
			for (let k = 0; k < len - 1; k++) {
				at = (at + HISTORY - 1) % HISTORY;
				const px = this.#hx[i * HISTORY + at];
				const py = this.#hy[i * HISTORY + at];
				out[m++] = x;
				out[m++] = y;
				out[m++] = px;
				out[m++] = py;
				out[m++] = base * (1 - k / (HISTORY - 1));
				out[m++] = base * (1 - (k + 1) / (HISTORY - 1));
				out[m++] = ink;
				x = px;
				y = py;
			}
		}
		painter.draw(out, m / SEGMENT_FLOATS);
	}

	/** The same trails stroked on a 2D canvas. */
	#stroke(ctx: CanvasRenderingContext2D) {
		ctx.clearRect(0, 0, this.#w, this.#h);
		const paths: (Path2D | undefined)[] = new Array(3 * ALPHA_STEPS);
		for (let i = 0; i < this.#n; i++) {
			const len = this.#len[i];
			if (len < 2) continue;
			const speed = this.#speed[i];
			const base = flowAlpha(speed);
			const offset = flowClass(speed) * ALPHA_STEPS;
			let at = this.#head[i];
			let x = this.#hx[i * HISTORY + at];
			let y = this.#hy[i * HISTORY + at];
			for (let k = 0; k < len - 1; k++) {
				at = (at + HISTORY - 1) % HISTORY;
				const px = this.#hx[i * HISTORY + at];
				const py = this.#hy[i * HISTORY + at];
				const alpha = base * (1 - k / (HISTORY - 1));
				const step = Math.min(ALPHA_STEPS - 1, Math.floor((alpha / ALPHA_MAX) * ALPHA_STEPS));
				const path = (paths[offset + step] ??= new Path2D());
				path.moveTo(x, y);
				path.lineTo(px, py);
				x = px;
				y = py;
			}
		}
		const inks = [this.#colors.quiet, this.#colors.strong, this.#colors.stronger];
		ctx.lineCap = 'round';
		for (let p = 0; p < paths.length; p++) {
			const path = paths[p];
			if (!path) continue;
			const cls = Math.floor(p / ALPHA_STEPS);
			ctx.strokeStyle = inks[cls];
			ctx.globalAlpha = (((p % ALPHA_STEPS) + 0.5) / ALPHA_STEPS) * ALPHA_MAX;
			ctx.lineWidth = WIDTHS[cls ? 1 : 0];
			ctx.stroke(path);
		}
		ctx.globalAlpha = 1;
	}
}
