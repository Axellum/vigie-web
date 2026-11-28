// The pills of the "Weather" layer on a MapLibre map (MapView): which towns of the base map get one, where, and the names of the
// base map they cover, which it stops writing (a pill writes its town's name under it). The towns are read from the tiles, not
// from the labels on screen: the labels change as the pills hide them, the tiles do not.
import type { Map as MlMap, Marker } from 'maplibre-gl';
import type { Lang } from './i18n';
import { townOf } from './sea/town';
import type { TownReading } from './townWeather';
import { TOWNS_PER_REQUEST } from './townWeather';
import { boardPalette, tempColour, type BoardPalette } from './widget/board';
import { fmt, iconSvg } from './widget/boardArt';

/** A town of the base map in view, the most important first. `id` is its name and place, the same from one move to the next. */
export interface TownInView {
	id: string;
	/** Its name as the map writes it, in the page's language. */
	name: string;
	/** Its name in the tiles (`name`), which the label filters match. */
	raw: string;
	lat: number;
	lon: number;
}

/** A pill to draw: a town and what it shows (null: its weather is not read yet, or not at all). */
export interface TownPill extends TownInView {
	reading: TownReading | null;
	/** What a screen reader says of it. */
	label: string;
}

/** The zoom from which the base map names each kind of place (its `label_city`, `label_town`, `label_village` layers). */
const FROM_ZOOM: Record<string, number> = { city: 3, town: 6, village: 9 };
const CLASS_ORDER: Record<string, number> = { city: 0, town: 1, village: 2 };
/** A pill and its name under it, px: the box kept free around each when they are laid out. */
const PILL_H = 44;
const PILL_GAP = 4;
/** The town's point is under its pill, above its name (the name is 13 px high). */
const POINT_FROM_BOTTOM = 7;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The width of a pill with what it shows, px (the drawing's own measures, a little generous). */
export function pillWidth(r: TownReading | null, name: string): number {
	let w = 62; // the icon, the temperature and the padding
	if (r?.tempMin != null) w += 22;
	if (r && r.rainMm >= 0.2) w += 36;
	if (r?.wind != null) w += 34;
	return Math.max(w, Math.min(150, name.length * 6.6 + 8));
}

type Box = [number, number, number, number];
const touch = (a: Box, b: Box) =>
	a[0] < b[2] + PILL_GAP && b[0] < a[2] + PILL_GAP && a[1] < b[3] + PILL_GAP && b[1] < a[3] + PILL_GAP;
const boxAt = (x: number, y: number, w: number): Box => [
	x - w / 2,
	y + POINT_FROM_BOTTOM - PILL_H,
	x + w / 2,
	y + POINT_FROM_BOTTOM
];

/** The names a pill's box covers: the label of a place is about 6.5 px a letter wide, 14 px high, centred on its point. */
const labelBox = (x: number, y: number, name: string): Box => {
	const w = name.length * 6.5;
	return [x - w / 2, y - 7, x + w / 2, y + 7];
};

export class TownMarkers {
	#markers = new Map<string, { marker: Marker; el: HTMLButtonElement; key: string }>();
	/** The filters the style gave the layers of places, before the names of the pills were taken out. */
	#filters = new Map<string, unknown>();
	#hidden = '';

	constructor(
		private readonly map: MlMap,
		private readonly ml: typeof import('maplibre-gl'),
		private readonly handlers: {
			hover: (id: string | null, at: DOMRect | null) => void;
			pick: (id: string) => void;
		}
	) {}

	#placeLayers(): { id: string; source: string }[] {
		const style = this.map.getStyle();
		return (style?.layers ?? []).flatMap((l) =>
			l.type === 'symbol' && 'source-layer' in l && l['source-layer'] === 'place'
				? [{ id: l.id, source: String(l.source) }]
				: []
		);
	}

	/** A new style (another theme) has its own filters: they are read again. */
	styleChanged() {
		this.#filters.clear();
		this.#hidden = '';
	}

	/** The towns in view the base map names at this zoom, the most important first: the capital, the cities, the towns, the villages. */
	inView(lang: Lang): TownInView[] {
		const layers = this.#placeLayers();
		if (!layers.length) return [];
		const zoom = this.map.getZoom();
		const { clientWidth: w, clientHeight: h } = this.map.getContainer();
		const seen = new Map<string, TownInView & { order: number }>();
		for (const f of this.map.querySourceFeatures(layers[0].source, { sourceLayer: 'place' })) {
			const p = f.properties ?? {};
			const cls = String(p.class);
			if (!(cls in FROM_ZOOM) || zoom < FROM_ZOOM[cls] || f.geometry.type !== 'Point') continue;
			const town = townOf(p, f.geometry.coordinates, lang);
			if (!town || typeof p.name !== 'string') continue;
			const xy = this.map.project([town.lon, town.lat]);
			if (xy.x < 0 || xy.y < PILL_H || xy.x > w || xy.y > h) continue;
			const id = `${p.name}@${town.lat.toFixed(3)},${town.lon.toFixed(3)}`;
			if (seen.has(id)) continue;
			const rank = finite(p.rank) ? p.rank : 99;
			const order = (p.capital === 2 ? 0 : 1) * 1e6 + CLASS_ORDER[cls] * 1e4 + rank * 10;
			seen.set(id, { id, name: town.name, raw: p.name, lat: town.lat, lon: town.lon, order });
		}
		const list = [...seen.values()].sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : 1));
		return this.#layout(list, (t) => pillWidth(null, t.name))
			.slice(0, TOWNS_PER_REQUEST)
			.map(({ town }) => ({ id: town.id, name: town.name, raw: town.raw, lat: town.lat, lon: town.lon }));
	}

	/** The towns kept, the most important first, a town whose box would touch one already kept left out. */
	#layout<T extends TownInView>(list: T[], widthOf: (t: T) => number): { town: T; box: Box }[] {
		const kept: { town: T; box: Box }[] = [];
		for (const town of list) {
			const xy = this.map.project([town.lon, town.lat]);
			const box = boxAt(xy.x, xy.y, widthOf(town));
			if (kept.some((k) => touch(k.box, box))) continue;
			kept.push({ town, box });
		}
		return kept;
	}

	/** Draw the pills (null: the layer is off), and stop the base map writing the names they cover. */
	draw(pills: TownPill[] | null, lang: Lang, theme: 'light' | 'dark') {
		const P = boardPalette(theme);
		const shown = pills
			? this.#layout(
					pills.filter((p) => p.reading),
					(p) => pillWidth(p.reading, p.name)
				)
			: [];
		const wanted = new Map(shown.map((s) => [s.town.id, s.town]));
		for (const [id, m] of this.#markers) {
			if (wanted.has(id)) continue;
			m.marker.remove();
			this.#markers.delete(id);
		}
		for (const [id, pill] of wanted) {
			const key = `${theme}|${lang}|${JSON.stringify(pill.reading)}|${pill.name}`;
			const known = this.#markers.get(id);
			if (known?.key === key) continue;
			const el = known?.el ?? document.createElement('button');
			if (!known) {
				el.type = 'button';
				el.className = 'vigie-town';
				el.dataset.testid = 'town-pill';
				el.onmouseenter = el.onfocus = () => this.handlers.hover(id, el.getBoundingClientRect());
				el.onmouseleave = el.onblur = () => this.handlers.hover(null, null);
				el.onclick = (event) => {
					event.stopPropagation();
					this.handlers.pick(id);
				};
			}
			el.dataset.town = pill.name;
			el.setAttribute('aria-label', pill.label);
			el.innerHTML = pillHtml(pill, P, lang);
			if (known) known.key = key;
			else
				this.#markers.set(id, {
					el,
					key,
					marker: new this.ml.Marker({ element: el, anchor: 'bottom', offset: [0, POINT_FROM_BOTTOM] })
						.setLngLat([pill.lon, pill.lat])
						.addTo(this.map)
				});
		}
		this.#hideNames(
			shown.map((s) => s.box),
			shown.map((s) => s.town.raw)
		);
	}

	/** The names of the pills' towns, and of the places their boxes cover, taken out of the base map's labels. */
	#hideNames(boxes: Box[], names: string[]) {
		const hidden = new Set(names);
		if (boxes.length) {
			const layers = this.#placeLayers();
			const source = layers[0]?.source;
			if (source)
				for (const f of this.map.querySourceFeatures(source, { sourceLayer: 'place' })) {
					const name = f.properties?.name;
					if (typeof name !== 'string' || hidden.has(name) || f.geometry.type !== 'Point') continue;
					const [lon, lat] = f.geometry.coordinates;
					const xy = this.map.project([lon, lat]);
					const box = labelBox(xy.x, xy.y, name);
					if (boxes.some((b) => touch(b, box))) hidden.add(name);
				}
		}
		const key = [...hidden].sort().join('\n');
		if (key === this.#hidden) return;
		this.#hidden = key;
		for (const { id } of this.#placeLayers()) {
			if (!this.#filters.has(id)) this.#filters.set(id, this.map.getFilter(id) ?? null);
			const original = this.#filters.get(id);
			const out = ['!', ['in', ['get', 'name'], ['literal', [...hidden]]]];
			this.map.setFilter(
				id,
				(hidden.size ? (original ? ['all', original, out] : out) : original) as Parameters<
					MlMap['setFilter']
				>[1]
			);
		}
	}

	clear() {
		for (const m of this.#markers.values()) m.marker.remove();
		this.#markers.clear();
		this.#hideNames([], []);
	}
}

const DROP =
	'<svg class="dr" viewBox="0 0 12 16" aria-hidden="true"><path d="M6 1C6 1 1 7.5 1 10.5a5 5 0 0 0 10 0C11 7.5 6 1 6 1Z"/></svg>';
const ARROW = (from: number | null) =>
	from == null
		? ''
		: `<svg class="ar" viewBox="0 0 16 16" style="transform:rotate(${Math.round(from + 180)}deg)" aria-hidden="true"><path d="M8 1.5 L12.5 12 L8 9.6 L3.5 12 Z"/></svg>`;

/** The inside of a pill: the icon of the sky, the temperature in its colour, the rain of the next hours, a strong wind; its name. */
export function pillHtml(pill: TownPill, P: BoardPalette, lang: Lang): string {
	const r = pill.reading;
	if (!r) return '';
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const rain =
		r.rainMm >= 0.2
			? `<span class="rn" style="color:${P.rain}">${DROP}${fmt(lang, r.rainMm, r.rainMm < 10 ? 1 : 0)}</span>`
			: '';
	const wind =
		r.wind != null
			? `<span class="wd" style="color:${P.wind}">${ARROW(r.windDeg)}${Math.round(r.wind)}</span>`
			: '';
	const low =
		r.tempMin != null
			? `<span class="lo" style="color:${tempColour(P, r.tempMin)}">${fmt(lang, r.tempMin)}°</span>`
			: '';
	return (
		`<span class="pl">${iconSvg(P, r.kind, 24)}<b style="color:${tempColour(P, r.temp)}">${fmt(lang, r.temp)}°</b>${low}${rain}${wind}</span>` +
		`<span class="nm">${esc(pill.name)}</span>`
	);
}
