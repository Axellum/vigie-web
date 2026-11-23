// The trails of the forecast wind ($lib/windFlow) drawn by the graphics card: one thin quadrilateral per segment, all of them in
// a single call. A 2D canvas strokes the same segments on the processor, which on a large or dense screen takes longer than an
// image lasts (3,000 trails of 11 segments: 23 images a second for the whole page at 2000 x 1100, 17 at twice the density); here
// the cost no longer depends on the size of the screen. The edges are smoothed in the shader, and the opacity runs evenly from the
// head of a segment to its tail.

/** Numbers per segment: head x, y, tail x, y (CSS pixels), opacity at the head and at the tail, colour (0, 1 or 2). */
export const SEGMENT_FLOATS = 7;

/** The names of WebGL renderers that run on the processor: a computer without a graphics card, or one the browser does not
 * trust. There the 2D canvas, drawn by the processor too, is the faster one (1,400 trails at 1280 x 720 without a graphics card:
 * 60 images a second on a 2D canvas, 15 with WebGL), and it leaves the processor to the map. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Whether a WebGL renderer, as the browser names it, runs on the processor. */
export function softwareRenderer(name: string): boolean {
	return SOFTWARE.test(name);
}

/** The name of the renderer behind a context: Chrome answers "WebKit WebGL" and gives the real one through an extension. */
function rendererName(gl: WebGL2RenderingContext): string {
	const named = String(gl.getParameter(gl.RENDERER) ?? '');
	if (named && named !== 'WebKit WebGL') return named;
	const info = gl.getExtension('WEBGL_debug_renderer_info');
	return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : named;
}

const VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 corner; // x: 0 at the head, 1 at the tail; y: -1 or 1, a side of the line
layout(location = 1) in vec4 ends;
layout(location = 2) in vec3 look;
uniform vec2 size; // the canvas in CSS pixels
uniform float density; // device pixels per CSS pixel
uniform vec2 widths; // the quiet ink's line and the coloured ones', in CSS pixels
out float alpha;
out float side; // distance from the middle of the line, in device pixels
out float half_width;
flat out int ink;
void main() {
	vec2 along = ends.zw - ends.xy;
	float reach = length(along);
	vec2 dir = reach > 0.0001 ? along / reach : vec2(1.0, 0.0);
	half_width = 0.5 * density * (look.z > 0.5 ? widths.y : widths.x);
	// One device pixel more on each side, for the smoothed edge.
	side = corner.y * (half_width + 1.0);
	vec2 at = mix(ends.xy, ends.zw, corner.x) + vec2(-dir.y, dir.x) * side / density;
	alpha = mix(look.x, look.y, corner.x);
	ink = int(look.z + 0.5);
	gl_Position = vec4(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in float alpha;
in float side;
in float half_width;
flat in int ink;
uniform vec3 inks[3];
out vec4 color;
void main() {
	float a = alpha * clamp(half_width - abs(side) + 0.5, 0.0, 1.0);
	color = vec4(inks[ink] * a, a); // premultiplied, as the page blends the canvas
}`;

/** A CSS colour as three numbers from 0 to 1, whatever its notation (read back from a pixel painted with it). */
function rgb(color: string): [number, number, number] {
	const probe = document.createElement('canvas');
	probe.width = probe.height = 1;
	const ctx = probe.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [0.5, 0.5, 0.5];
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return [r / 255, g / 255, b / 255];
}

export class TrailPainter {
	readonly #canvas: HTMLCanvasElement;
	readonly #gl: WebGL2RenderingContext;
	readonly #onRestore: () => void;
	#program: WebGLProgram | null = null;
	#segments: WebGLBuffer | null = null;
	#room = 0;
	#inks = new Float32Array(9);
	#widths: [number, number] = [1, 1];
	#w = 1;
	#h = 1;
	#density = 1;
	#lost = false;
	readonly #onLost = (event: Event) => {
		// Without this the browser never gives the context back.
		event.preventDefault();
		this.#lost = true;
	};
	readonly #onRestored = () => {
		this.#lost = false;
		this.#program = null;
		this.#build();
		this.#onRestore();
	};

	/** A painter for this canvas, or null when the browser gives no WebGL 2, or one that runs on the processor (the caller then
	 * draws on a 2D canvas). */
	static make(canvas: HTMLCanvasElement, onRestore: () => void): TrailPainter | null {
		try {
			const gl = canvas.getContext('webgl2', {
				alpha: true,
				premultipliedAlpha: true,
				antialias: false,
				depth: false,
				stencil: false,
				// For the end-to-end tests only (a browser driven by them says so): what was drawn stays readable.
				preserveDrawingBuffer: navigator.webdriver === true
			});
			if (!gl) return null;
			if (softwareRenderer(rendererName(gl))) {
				gl.getExtension('WEBGL_lose_context')?.loseContext();
				return null;
			}
			const painter = new TrailPainter(canvas, gl, onRestore);
			return painter.#build() ? painter : null;
		} catch {
			return null;
		}
	}

	private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, onRestore: () => void) {
		this.#canvas = canvas;
		this.#gl = gl;
		this.#onRestore = onRestore;
		canvas.addEventListener('webglcontextlost', this.#onLost);
		canvas.addEventListener('webglcontextrestored', this.#onRestored);
	}

	#build(): boolean {
		const gl = this.#gl;
		const shader = (type: number, source: string) => {
			const s = gl.createShader(type);
			if (!s) return null;
			gl.shaderSource(s, source);
			gl.compileShader(s);
			return s;
		};
		const vertex = shader(gl.VERTEX_SHADER, VERTEX);
		const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
		const program = gl.createProgram();
		if (!vertex || !fragment || !program) return false;
		gl.attachShader(program, vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
		gl.useProgram(program);
		this.#program = program;
		// The four corners of a segment, the same for all; then one line of numbers per segment.
		gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.#segments = gl.createBuffer();
		this.#room = 0;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#segments);
		const stride = SEGMENT_FLOATS * 4;
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
		gl.vertexAttribDivisor(1, 1);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 16);
		gl.vertexAttribDivisor(2, 1);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.clearColor(0, 0, 0, 0);
		this.#uniforms();
		return true;
	}

	#uniforms() {
		const gl = this.#gl;
		const program = this.#program;
		if (!program) return;
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.uniform2f(gl.getUniformLocation(program, 'size'), this.#w, this.#h);
		gl.uniform1f(gl.getUniformLocation(program, 'density'), this.#density);
		gl.uniform2f(gl.getUniformLocation(program, 'widths'), this.#widths[0], this.#widths[1]);
		gl.uniform3fv(gl.getUniformLocation(program, 'inks'), this.#inks);
	}

	/** The size of the canvas in CSS pixels and its density; the canvas itself is sized by the caller. */
	resize(width: number, height: number, density: number) {
		this.#w = Math.max(1, width);
		this.#h = Math.max(1, height);
		this.#density = density;
		if (!this.#lost) this.#uniforms();
	}

	/** The three inks (CSS colours) and the widths of the quiet and of the coloured lines, in CSS pixels. */
	look(inks: [string, string, string], widths: [number, number]) {
		this.#inks.set(inks.flatMap(rgb));
		this.#widths = widths;
		if (!this.#lost) this.#uniforms();
	}

	clear() {
		if (!this.#lost) this.#gl.clear(this.#gl.COLOR_BUFFER_BIT);
	}

	/** Draws the first `count` segments of `segments` (`SEGMENT_FLOATS` numbers each) on a cleared canvas. */
	draw(segments: Float32Array, count: number) {
		if (this.#lost || !this.#program) return;
		const gl = this.#gl;
		gl.clear(gl.COLOR_BUFFER_BIT);
		if (count <= 0) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#segments);
		if (segments.byteLength > this.#room) {
			gl.bufferData(gl.ARRAY_BUFFER, segments.byteLength, gl.DYNAMIC_DRAW);
			this.#room = segments.byteLength;
		}
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, segments, 0, count * SEGMENT_FLOATS);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
	}

	/** Gives the context back at once: a browser keeps only a few, and would take the map's own to make room. */
	destroy() {
		this.#canvas.removeEventListener('webglcontextlost', this.#onLost);
		this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored);
		this.#gl.getExtension('WEBGL_lose_context')?.loseContext();
	}
}
