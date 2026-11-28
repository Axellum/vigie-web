<script lang="ts" module>
	export type Selection =
		| { kind: 'hazard'; id: string }
		| { kind: 'zone'; key: string }
		| { kind: 'fire'; lon: number; lat: number; props: Record<string, unknown> }
		| { kind: 'tide'; lon: number; lat: number; props: Record<string, unknown> }
		| { kind: 'spot'; id: string };
</script>

<script lang="ts">
	// The map: OpenFreeMap base map, official warning zones (polygons or river sections) and hazards.
	// MapLibre (code and stylesheet) is loaded after the page is shown, so that the text of the page comes first.
	import { onDestroy, onMount } from 'svelte';
	import type { Feature, FeatureCollection } from 'geojson';
	import type {
		CanvasSource,
		Map as MlMap,
		Marker,
		GeoJSONSource,
		ExpressionSpecification
	} from 'maplibre-gl';
	// Only the address of MapLibre's worker, which Vite builds as a file of the site.
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { BASEMAP_HOST, BASEMAP_STYLE_PATHS, localizedTextField } from '#lib/basemap.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import type { Box } from '#lib/geo.js';
	import { circleRing, type Place } from '#lib/near.js';
	import type { Hazard } from '#lib/types.js';
	import type { RadarOnMap } from '#lib/radar.js';
	import type { RainFieldOnMap } from '#lib/rainField.js';
	import { RainFieldPainter, type PaintedRain } from '#lib/rainFieldPainter.js';
	import type { ObservedRainOnMap } from '#lib/observedRain.js';
	import { RELIEF_HOST, RELIEF_PREFIX, reliefBefore, reliefPieces, type ReliefOnMap } from '#lib/relief.js';
	import { bandOf, keepLabels, LABEL_OFFSET, type SeaPin } from '#lib/sea/map.js';
	import { townOf, type Town } from '#lib/sea/town.js';
	import { compass } from '#lib/surf.js';
	import {
		badgeRadius,
		declutter,
		gustShown,
		windBadgeSvg,
		windTime,
		windValue,
		type WindOnMap,
		type WindPoint
	} from '#lib/wind.js';
	import type { FieldGrid } from '#lib/windField.js';
	import { WindFlow, type FlowColors } from '#lib/windFlow.js';
	import { byKey, featureChanges } from '#lib/zoneFeatures.js';

	interface Props {
		lang: Lang;
		hazards?: Hazard[];
		zones?: FeatureCollection;
		/** The zoom from which the zones are drawn (from the start when not given). */
		zonesFrom?: number;
		selected?: Selection | null;
		frame?: Box | null;
		globe?: boolean;
		label?: string;
		/** The forecast of the selected hazard: a storm's cone, track, positions and coastal warnings, a tsunami's
		 * epicentre and arrival places (`HazardForecast.features`). */
		forecast?: FeatureCollection | null;
		/** A chosen place, drawn as a dot and the circle of its radius. */
		place?: (Place & { radiusKm: number | null }) | null;
		/** A polygon being drawn or shown ([lon, lat] corners, not closed): its corners, edges and surface. */
		drawing?: [number, number][] | null;
		/** Active fires: cells of a grid (with `n`) or detections (`FireTile.features`). */
		fires?: FeatureCollection | null;
		/** NOAA's OVATION aurora oval as bands (`properties.min`), drawn under everything else. */
		aurora?: FeatureCollection | null;
		/** A solar eclipse as the API draws it: bands of the share hidden, the path and its central line (`properties.kind`). */
		eclipse?: FeatureCollection | null;
		/** The tide now along the coasts, computed by the API (`TideTile.features`: `up` 1 rising, 0 falling). */
		tides?: FeatureCollection | null;
		/** The rain radar: the images to draw (only the active one, or all of them once `preload` is set, so that a slider and an
		 * animation do not wait for tiles), drawn over the warnings and under the labels of the base map. Null: no radar. */
		radar?: RadarOnMap | null;
		/** Global/Europe/France forecast rain RGBA PNG overlays (ARPEGE/AROME), the coarsest first (`pickRainStack`), drawn above
		 * warnings and below radar & labels. Null or empty: off. */
		rainField?: RainFieldOnMap[] | null;
		/** Global observed satellite precipitation raster tiles (NASA GIBS IMERG), drawn above warnings and below radar & labels. Null: off. */
		observedRain?: ObservedRainOnMap | null;
		/** The IGN's relief of France ($lib/relief), over the land colours of the base map and under all the rest. Null: off. */
		relief?: ReliefOnMap | null;
		/** The wind measured now: a badge per station or buoy, the strongest kept where badges would touch, over everything else.
		 * Null: no wind. */
		wind?: WindOnMap | null;
		/** The forecast wind, the finest grid first: thin trails that follow it, over the rain and the warnings' markers, under
		 * the badges of the measured wind. Null: none. */
		flow?: FieldGrid[] | null;
		/** Surf spots (`properties.id`, `name`, and `q`: the band of the rating of the current hour, 0 to 3, or -1 without one). */
		spots?: FeatureCollection | null;
		/** The pins of the sea map (`sea/map.ts`): a label beside the dot of each spot of `spots`, with the figures of the hour; where
		 * labels would touch, the best verdict is kept, and the spot selected always. A click on a label selects its spot. */
		pins?: SeaPin[] | null;
		onselect?: (selection: Selection) => void;
		onmove?: (view: Box, zoom: number) => void;
		/** When given, a click on the map chooses a place. */
		onpick?: (place: Place) => void;
		/** When given, the names of the towns, cities and villages of the base map can be clicked (the sea map). */
		ontown?: (town: Town) => void;
	}

	let {
		lang,
		hazards = [],
		zones = { type: 'FeatureCollection', features: [] },
		zonesFrom = 0,
		selected = null,
		frame = null,
		globe = false,
		label,
		place = null,
		drawing = null,
		forecast = null,
		fires = null,
		aurora = null,
		eclipse = null,
		tides = null,
		radar = null,
		rainField = null,
		observedRain = null,
		relief = null,
		wind = null,
		flow = null,
		spots = null,
		pins = null,
		onselect,
		onmove,
		onpick,
		ontown
	}: Props = $props();

	const tr = $derived(translator(lang));
	// OpenFreeMap's styles, from the site with the address of their tiles written in: MapLibre does not ask for the
	// description of the tiles before the first ones.
	const STYLE = BASEMAP_STYLE_PATHS;

	let container: HTMLDivElement;
	let map: MlMap | null = null;
	let ml: typeof import('maplibre-gl') | null = null;
	let failed = $state(false);
	let ready = $state(false);
	// The base map has drawn its first tiles: until then, the map says it is loading (on a slow phone connection,
	// its first tiles take a few seconds).
	let drawn = $state(false);
	let globeOn = $state(false);
	let markers = new Map<string, { marker: Marker; el: HTMLButtonElement }>();
	let observer: MutationObserver | null = null;
	let media: MediaQueryList | null = null;
	let currentTheme: 'light' | 'dark' = 'light';

	const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const levelColor = (key: string): ExpressionSpecification => [
		'match',
		['get', key],
		'RED',
		css('--sev-red'),
		'ORANGE',
		css('--sev-orange'),
		'YELLOW',
		css('--sev-yellow'),
		'GREEN',
		css('--sev-green'),
		css('--sev-none')
	];
	// The highest level is drawn last, on top, whatever the order of the zones in the source (a zone with no known level over
	// them all, as the pages sorted them before).
	const levelOrder: ExpressionSpecification = [
		'match',
		['get', 'level'],
		'RED',
		4,
		'ORANGE',
		3,
		'YELLOW',
		2,
		'GREEN',
		1,
		5
	];
	const isArea: ExpressionSpecification = [
		'match',
		['geometry-type'],
		['Polygon', 'MultiPolygon'],
		true,
		false
	];
	const isLine: ExpressionSpecification = [
		'match',
		['geometry-type'],
		['LineString', 'MultiLineString'],
		true,
		false
	];

	function theme(): 'light' | 'dark' {
		const set = document.documentElement.dataset.theme;
		if (set === 'light' || set === 'dark') return set;
		return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	function quakes(): FeatureCollection {
		return {
			type: 'FeatureCollection',
			features: hazards
				.filter((h) => h.category === 'EARTHQUAKE')
				.map((h) => ({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
					properties: { id: h.id, level: h.level ?? 'NONE', mag: h.value ?? 4 }
				}))
		};
	}

	function drawingData(): FeatureCollection {
		const corners = drawing ?? [];
		const features: FeatureCollection['features'] = corners.map((c) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: c },
			properties: {}
		}));
		if (corners.length >= 2)
			features.push({
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: corners.length >= 3 ? [...corners, corners[0]] : corners
				},
				properties: {}
			});
		if (corners.length >= 3)
			features.push({
				type: 'Feature',
				geometry: { type: 'Polygon', coordinates: [[...corners, corners[0]]] },
				properties: {}
			});
		return { type: 'FeatureCollection', features };
	}

	function placeData(): FeatureCollection {
		if (!place) return { type: 'FeatureCollection', features: [] };
		return {
			type: 'FeatureCollection',
			features: [
				...(place.radiusKm
					? [
							{
								type: 'Feature' as const,
								geometry: { type: 'LineString' as const, coordinates: circleRing(place, place.radiusKm) },
								properties: {}
							}
						]
					: []),
				{
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
					properties: {}
				}
			]
		};
	}

	const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
	const forecastData = () => forecast ?? EMPTY;
	const fireData = () => fires ?? EMPTY;
	const auroraData = () => aurora ?? EMPTY;
	const eclipseData = () => eclipse ?? EMPTY;
	const tideData = () => tides ?? EMPTY;
	const spotData = () => spots ?? EMPTY;
	const kindIs = (...kinds: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', kinds]];

	function addForecastLayers() {
		if (!map) return;
		const ink = css('--ink');
		addUnderRain({
			id: 'fc-cone',
			type: 'fill',
			source: 'forecast',
			filter: kindIs('cone'),
			paint: { 'fill-color': ink, 'fill-opacity': 0.12 }
		});
		addUnderRain({
			id: 'fc-cone-edge',
			type: 'line',
			source: 'forecast',
			filter: kindIs('cone'),
			paint: { 'line-color': ink, 'line-width': 1.2, 'line-dasharray': [2, 2] }
		});
		// The NHC's own colours for its coastal watches and warnings.
		addUnderRain({
			id: 'fc-warning',
			type: 'line',
			source: 'forecast',
			filter: kindIs('watch_warning'),
			layout: { 'line-cap': 'round' },
			paint: {
				'line-color': [
					'match',
					['get', 'code'],
					'HWR',
					'#e0202a',
					'HWA',
					'#f06ec8',
					'TWR',
					'#2b6fe0',
					'TWA',
					'#f2c718',
					ink
				],
				'line-width': 5
			}
		});
		addUnderRain({
			id: 'fc-track',
			type: 'line',
			source: 'forecast',
			filter: kindIs('track'),
			paint: { 'line-color': ink, 'line-width': 2 }
		});
		addUnderRain({
			id: 'fc-point',
			type: 'circle',
			source: 'forecast',
			filter: kindIs('position', 'eta', 'epicentre'),
			paint: {
				'circle-radius': ['match', ['get', 'kind'], 'epicentre', 7, 5],
				'circle-color': ['match', ['get', 'kind'], 'epicentre', css('--sev-orange'), css('--surface')],
				'circle-stroke-color': ink,
				'circle-stroke-width': 2
			}
		});
		map.addLayer({
			id: 'fc-label',
			type: 'symbol',
			source: 'forecast',
			filter: kindIs('position', 'eta'),
			layout: {
				'text-field': [
					'case',
					['==', ['get', 'kind'], 'position'],
					['concat', '+', ['to-string', ['get', 'tau_h']], ' h'],
					['coalesce', ['get', 'place'], '']
				],
				'text-font': ['Noto Sans Regular'],
				'text-size': 12,
				'text-offset': [0, 1.1],
				'text-anchor': 'top',
				'text-optional': true
			},
			paint: { 'text-color': ink, 'text-halo-color': css('--surface'), 'text-halo-width': 1.5 }
		});
	}

	// The size of a cell grows with the square root of its detections, up to about half the distance between two
	// cells at the zooms of its level ($lib/fires: 5° until zoom 3, 1° until 5.5, 0.25° until 7.5).
	const cellRadius = (max: number): ExpressionSpecification => [
		'+',
		2,
		['*', max, ['min', 1, ['/', ['sqrt', ['get', 'n']], 30]]]
	];

	function addFireLayers() {
		if (!map) return;
		const fire = css('--fire');
		map.addLayer({
			id: 'fire-cell',
			type: 'circle',
			source: 'fires',
			filter: ['has', 'n'],
			paint: {
				'circle-radius': [
					'interpolate',
					['linear'],
					['zoom'],
					0,
					cellRadius(2),
					2.99,
					cellRadius(24),
					3,
					cellRadius(5),
					5.49,
					cellRadius(28),
					5.5,
					cellRadius(7),
					7.49,
					cellRadius(24)
				],
				'circle-color': fire,
				'circle-opacity': 0.5,
				'circle-stroke-color': fire,
				'circle-stroke-width': 1
			}
		});
		map.addLayer({
			id: 'fire-dot',
			type: 'circle',
			source: 'fires',
			filter: ['!', ['has', 'n']],
			paint: {
				'circle-radius': [
					'interpolate',
					['linear'],
					['zoom'],
					7.5,
					['interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0], 0, 3, 100, 5, 1000, 8],
					12,
					['interpolate', ['linear'], ['coalesce', ['get', 'frp'], 0], 0, 5, 100, 8, 1000, 13]
				],
				'circle-color': fire,
				'circle-opacity': ['match', ['get', 'c'], 'low', 0.45, 0.9],
				'circle-stroke-color': css('--surface'),
				'circle-stroke-width': 1
			}
		});
	}

	// The tide along the coasts: a dot per point of the model, filled where the tide rises, open where it falls.
	function addTideLayers() {
		if (!map) return;
		const accent = css('--accent');
		map.addLayer({
			id: 'tide-dot',
			type: 'circle',
			source: 'tides',
			paint: {
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2.5, 7, 4, 10, 6],
				'circle-color': ['case', ['==', ['get', 'up'], 1], accent, css('--surface')],
				'circle-stroke-color': accent,
				'circle-stroke-width': 1.2,
				'circle-opacity': 0.95
			}
		});
	}

	// The surf spots: a dot coloured by the rating of the current hour (its band, `surf.ts`), open without one; named from zoom 8.
	function addSpotLayers() {
		if (!map) return;
		map.addLayer({
			id: 'spot-dot',
			type: 'circle',
			source: 'spots',
			paint: {
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 8, 7, 12, 10],
				'circle-color': [
					'match',
					['get', 'q'],
					0,
					css('--surf-q0'),
					1,
					css('--surf-q1'),
					2,
					css('--surf-q2'),
					3,
					css('--surf-q3'),
					css('--surface')
				],
				'circle-stroke-color': css('--ink'),
				'circle-stroke-width': 1,
				'circle-stroke-opacity': 0.55
			}
		});
		map.addLayer({
			id: 'spot-label',
			type: 'symbol',
			source: 'spots',
			minzoom: 8,
			layout: {
				'text-field': ['get', 'name'],
				'text-font': ['Noto Sans Regular'],
				'text-size': 12,
				'text-offset': [0, 1],
				'text-anchor': 'top',
				'text-optional': true
			},
			paint: { 'text-color': css('--ink'), 'text-halo-color': css('--surface'), 'text-halo-width': 1.5 }
		});
	}

	// The base map names places in English: in the page's language instead, where the tiles have the name.
	// The town whose name is under a point of the map, give or take a few pixels (the names are small, a finger is not): the names
	// are in the base map's `place` layer, whose layers are named and laid out differently in the light and the dark style.
	const TOWN_SLOP_PX = 6;
	function townAt(point: { x: number; y: number }): Town | null {
		if (!map) return null;
		const layers = map
			.getStyle()
			.layers.filter((l) => l.type === 'symbol' && 'source-layer' in l && l['source-layer'] === 'place')
			.map((l) => l.id);
		if (!layers.length) return null;
		const box: [[number, number], [number, number]] = [
			[point.x - TOWN_SLOP_PX, point.y - TOWN_SLOP_PX],
			[point.x + TOWN_SLOP_PX, point.y + TOWN_SLOP_PX]
		];
		for (const f of map.queryRenderedFeatures(box, { layers })) {
			if (f.geometry.type !== 'Point') continue;
			const town = townOf(f.properties ?? {}, f.geometry.coordinates, lang);
			if (town) return town;
		}
		return null;
	}

	function localizeLabels() {
		if (!map) return;
		for (const layer of map.getStyle().layers) {
			if (layer.type !== 'symbol') continue;
			const field = localizedTextField(map.getLayoutProperty(layer.id, 'text-field'), lang);
			if (field) map.setLayoutProperty(layer.id, 'text-field', field);
		}
	}

	// The order of the map, from the bottom: the base map (its land, water and woods, then the IGN's relief of France when it is
	// on, then its rivers, roads and borders), the warnings (zones, rivers, earthquakes, a cyclone's forecast, with
	// the aurora and the eclipse under them as before), the rain radar, the names of the base map (readable over the rain), the
	// site's other layers and selections; then the forecast wind's canvas and, on top, the badges of the measured wind (z-index
	// in the styles below). The warnings and the radar both go under the first label of the base map: the warnings when the
	// overlay is added, the radar after them (`syncRadar` last in `addOverlay`, and later on the same spot), so it lies over them.
	let labelsFrom: string | undefined;
	const addUnderRain = (layer: Parameters<MlMap['addLayer']>[0]) => map?.addLayer(layer, labelsFrom);

	// The rain radar: a raster layer per image drawn, each under the first label of the base map (so that names stay readable),
	// the active one visible and the others transparent (they are only loaded, for the animation).
	const radarIds = new Set<string>();
	// The address of the tiles each radar layer was added with: a newer PIAF run draws the same time at another address.
	const radarTilesOf = new Map<string, string>();
	// The forecast rain: canvas layers (`rain-field-<level>-<n>`), a coarser level in pieces around a finer one ($lib/rainFieldPainter).
	const rainLevels = new Set<string>();
	const rainPainter = new RainFieldPainter(drawRain);
	let rainAgain = false;
	let observedRainKey: string | null = null;
	let overlayAdded = false;
	const RADAR_OPACITY = 0.85;
	const RAIN_FIELD_OPACITY = 0.72;
	const OBSERVED_RAIN_OPACITY = 0.72;

	/** First radar layer currently on the map (or `labelsFrom` when none): global rain layers go right under it. */
	function beforeRadarOrLabels(): string | undefined {
		if (!map) return labelsFrom;
		const firstRadar = map.getStyle().layers.find((l) => l.id.startsWith('radar-'))?.id;
		return firstRadar ?? labelsFrom;
	}

	// What the `zones` source holds, by key (null: a list without keys, which is only replaced whole).
	let zonesHeld: Map<string, Feature> | null = null;

	/** Tells the map what changed in the zones: the worker is sent the zones that are new, gone or changed, and builds again only
	 * the tiles they touch. A list that shares nothing with the one before is sent whole. */
	function syncZones() {
		const source = map?.getSource('zones') as GeoJSONSource | undefined;
		if (!source) return;
		const next = byKey(zones.features);
		const changes = zonesHeld && next ? featureChanges(zonesHeld, next) : null;
		zonesHeld = next;
		if (changes && !changes.add.length && !changes.remove.length) return;
		if (changes?.kept) source.updateData({ add: changes.add, remove: changes.remove });
		else source.setData(zones);
	}

	// The relief: what is drawn now (its contour lines, the theme, the credit), so that a page that gives the same again changes nothing.
	let reliefKey: string | null = null;

	function syncRelief() {
		if (!map || !overlayAdded) return;
		const nextKey = relief ? `${currentTheme}|${relief.contours}|${relief.credit}` : null;
		if (nextKey === reliefKey) return;
		const style = map.getStyle();
		for (const layer of style.layers) if (layer.id.startsWith(RELIEF_PREFIX)) map.removeLayer(layer.id);
		for (const id of Object.keys(style.sources)) if (id.startsWith(RELIEF_PREFIX)) map.removeSource(id);
		reliefKey = nextKey;
		if (!relief) return;
		const before = reliefBefore(style.layers.filter((l) => !l.id.startsWith(RELIEF_PREFIX)));
		for (const piece of reliefPieces(relief, currentTheme)) {
			map.addSource(piece.id, piece.source);
			map.addLayer(piece.layer as Parameters<MlMap['addLayer']>[0], before);
		}
	}

	function syncObservedRain() {
		if (!map || !overlayAdded) return;
		const nextKey = observedRain ? `${observedRain.id}|${observedRain.tiles}` : null;
		if (nextKey === observedRainKey) return;
		if (map.getLayer('observed-rain')) map.removeLayer('observed-rain');
		if (map.getSource('observed-rain')) map.removeSource('observed-rain');
		observedRainKey = null;
		if (!observedRain) return;
		map.addSource('observed-rain', {
			type: 'raster',
			tiles: [observedRain.tiles],
			tileSize: 256,
			minzoom: observedRain.minZoom,
			maxzoom: observedRain.maxZoom,
			bounds: observedRain.bounds,
			attribution: observedRain.attribution
		});
		map.addLayer(
			{
				id: 'observed-rain',
				type: 'raster',
				source: 'observed-rain',
				paint: {
					'raster-opacity': OBSERVED_RAIN_OPACITY,
					'raster-opacity-transition': { duration: 0 },
					'raster-fade-duration': 0
				}
			},
			beforeRadarOrLabels()
		);
		observedRainKey = nextKey;
	}

	function syncRainField() {
		if (!map || !overlayAdded) return;
		rainPainter.want(rainField ?? [], rainAgain);
		rainAgain = false;
	}

	/** Draws the levels the painter made ready, all in the same image: the rain of the previous stack stays until then. */
	function drawRain(pieces: PaintedRain[]) {
		if (!map || !overlayAdded) return;
		const keep = new Set(pieces.map((p) => p.id));
		for (const id of [...rainLevels]) {
			if (keep.has(id)) continue;
			if (map.getLayer(id)) map.removeLayer(id);
			if (map.getSource(id)) map.removeSource(id);
			rainLevels.delete(id);
		}
		for (const l of pieces) {
			const id = l.id;
			const source = map.getSource(id) as CanvasSource | undefined;
			if (source) {
				if (source.coordinates.join() !== l.coordinates.join()) source.setCoordinates(l.coordinates);
				// A canvas that does not play is read once; playing it for one image reads it again.
				if (l.changed) {
					source.play();
					map.once('render', () => source.pause());
				}
				continue;
			}
			map.addSource(id, { type: 'canvas', canvas: l.canvas, coordinates: l.coordinates, animate: false });
			map.addLayer(
				{
					id,
					type: 'raster',
					source: id,
					paint: {
						'raster-opacity': RAIN_FIELD_OPACITY,
						'raster-opacity-transition': { duration: 0 },
						'raster-fade-duration': 0,
						'raster-resampling': 'linear'
					}
				},
				beforeRadarOrLabels()
			);
			rainLevels.add(id);
		}
		// The coarsest level at the bottom, even when a finer one came first (drawn alone while the coarser one was loading).
		const order = map.getLayersOrder().filter((id) => keep.has(id));
		if (order.join() !== pieces.map((p) => p.id).join())
			for (const p of pieces) map.moveLayer(p.id, beforeRadarOrLabels());
	}

	function syncRadar() {
		if (!map || !overlayAdded) return;
		const wanted = radar ? radar.frames.filter((f) => radar!.preload || f.epoch === radar!.active) : [];
		const keep = new Set(wanted.map((f) => `radar-${f.epoch}`));
		for (const id of [...radarIds]) {
			if (keep.has(id)) continue;
			if (map.getLayer(id)) map.removeLayer(id);
			if (map.getSource(id)) map.removeSource(id);
			radarIds.delete(id);
			radarTilesOf.delete(id);
		}
		if (!radar) return;
		for (const f of wanted) {
			const id = `radar-${f.epoch}`;
			const opacity = f.epoch === radar.active ? RADAR_OPACITY : 0;
			if (radarIds.has(id) && radarTilesOf.get(id) !== f.tiles) {
				// The same time drawn by a newer PIAF run: the old run's tiles go, the layer is added again below.
				if (map.getLayer(id)) map.removeLayer(id);
				if (map.getSource(id)) map.removeSource(id);
				radarIds.delete(id);
			}
			if (radarIds.has(id)) {
				map.setPaintProperty(id, 'raster-opacity', opacity);
				continue;
			}
			map.addSource(id, {
				type: 'raster',
				tiles: [f.tiles],
				tileSize: 256,
				minzoom: f.minZoom ?? radar.minZoom,
				maxzoom: f.maxZoom ?? radar.maxZoom,
				bounds: f.bounds ?? radar.bounds,
				attribution: radar.attribution
			});
			map.addLayer(
				{
					id,
					type: 'raster',
					source: id,
					paint: {
						'raster-opacity': opacity,
						'raster-opacity-transition': { duration: 0 },
						'raster-fade-duration': 0
					}
				},
				labelsFrom
			);
			radarIds.add(id);
			radarTilesOf.set(id, f.tiles);
		}
	}

	function addOverlay() {
		if (!map) return;
		// A new style has none of the radar or global rain layers; the first label of the base map is where they go under.
		radarIds.clear();
		radarTilesOf.clear();
		rainLevels.clear();
		rainAgain = true;
		observedRainKey = null;
		labelsFrom = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
		// The base map in the site's own land and water colors (the dark style has almost no contrast
		// between them at world scale).
		if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', css('--map-land'));
		if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', css('--map-water'));
		// The key of a zone is its identifier in the source: what `updateData` needs to change one zone.
		map.addSource('zones', { type: 'geojson', data: zones, promoteId: 'key' });
		zonesHeld = byKey(zones.features);
		map.addSource('quakes', { type: 'geojson', data: quakes() });
		map.addSource('place', { type: 'geojson', data: placeData() });
		map.addSource('forecast', { type: 'geojson', data: forecastData() });
		map.addSource('fires', { type: 'geojson', data: fireData() });
		map.addSource('aurora', { type: 'geojson', data: auroraData() });
		// The aurora bands, from faint green to red as NOAA's maps do; the levels of the bands are the API's.
		addUnderRain({
			id: 'aurora-fill',
			type: 'fill',
			source: 'aurora',
			paint: {
				'fill-color': [
					'interpolate',
					['linear'],
					['get', 'min'],
					5,
					'#3ccf6e',
					20,
					'#9be33a',
					40,
					'#f2d22e',
					60,
					'#e8462c'
				],
				'fill-opacity': ['interpolate', ['linear'], ['get', 'min'], 5, 0.18, 20, 0.35, 60, 0.55],
				'fill-antialias': false
			}
		});
		map.addSource('eclipse', { type: 'geojson', data: eclipseData() });
		// The share of the Sun hidden, darker as it grows; the path of totality (or of the ring) dark, its central line dashed.
		addUnderRain({
			id: 'eclipse-band',
			type: 'fill',
			source: 'eclipse',
			filter: ['==', ['get', 'kind'], 'obscuration'],
			paint: {
				'fill-color': '#6b5bd6',
				'fill-opacity': ['interpolate', ['linear'], ['get', 'min'], 0, 0.06, 0.8, 0.3],
				'fill-antialias': false
			}
		});
		addUnderRain({
			id: 'eclipse-path',
			type: 'fill',
			source: 'eclipse',
			filter: ['==', ['get', 'kind'], 'path'],
			paint: { 'fill-color': '#1d1640', 'fill-opacity': 0.7 }
		});
		addUnderRain({
			id: 'eclipse-line',
			type: 'line',
			source: 'eclipse',
			filter: ['==', ['get', 'kind'], 'central_line'],
			paint: { 'line-color': '#f2d22e', 'line-width': 1.5, 'line-dasharray': [2, 2] }
		});
		map.addSource('tides', { type: 'geojson', data: tideData() });
		map.addSource('spots', { type: 'geojson', data: spotData() });
		addUnderRain({
			id: 'zone-fill',
			type: 'fill',
			source: 'zones',
			minzoom: zonesFrom,
			filter: isArea,
			layout: { 'fill-sort-key': levelOrder },
			paint: { 'fill-color': levelColor('level'), 'fill-opacity': 0.4 }
		});
		addUnderRain({
			id: 'zone-outline',
			type: 'line',
			source: 'zones',
			minzoom: zonesFrom,
			filter: isArea,
			layout: { 'line-sort-key': levelOrder },
			paint: { 'line-color': levelColor('level'), 'line-width': 0.9 }
		});
		addUnderRain({
			id: 'zone-river',
			type: 'line',
			source: 'zones',
			minzoom: zonesFrom,
			filter: isLine,
			layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': levelOrder },
			paint: {
				'line-color': levelColor('level'),
				'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 6]
			}
		});
		map.addLayer({
			id: 'zone-selected',
			type: 'line',
			source: 'zones',
			minzoom: zonesFrom,
			filter: ['==', ['get', 'key'], ''],
			paint: { 'line-color': css('--ink'), 'line-width': 2.5 }
		});
		addFireLayers();
		addTideLayers();
		addSpotLayers();
		addUnderRain({
			id: 'quake',
			type: 'circle',
			source: 'quakes',
			paint: {
				'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 3, 3, 5, 5.5, 6, 8.5, 7, 12, 8, 17],
				'circle-color': levelColor('level'),
				'circle-opacity': 0.9,
				'circle-stroke-color': css('--surface'),
				'circle-stroke-width': 1
			}
		});
		map.addLayer({
			id: 'quake-selected',
			type: 'circle',
			source: 'quakes',
			filter: ['==', ['get', 'id'], ''],
			paint: {
				'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 3, 8, 5, 10.5, 6, 13.5, 7, 17, 8, 22],
				'circle-color': 'rgba(0,0,0,0)',
				'circle-stroke-color': css('--ink'),
				'circle-stroke-width': 2.5
			}
		});
		addForecastLayers();
		// Global observed rain, forecast rain and radar after every warning: over them, under the labels of the base map.
		overlayAdded = true;
		// A new style has no relief: drawn again, under the rivers and roads of the base map.
		reliefKey = null;
		syncRelief();
		syncObservedRain();
		syncRainField();
		syncRadar();
		map.addLayer({
			id: 'place-radius',
			type: 'line',
			source: 'place',
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: { 'line-color': css('--accent'), 'line-width': 1.5, 'line-dasharray': [3, 2] }
		});
		map.addLayer({
			id: 'place-dot',
			type: 'circle',
			source: 'place',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-radius': 7,
				'circle-color': css('--accent'),
				'circle-stroke-color': css('--surface'),
				'circle-stroke-width': 2.5
			}
		});
		map.addSource('drawing', { type: 'geojson', data: drawingData() });
		map.addLayer({
			id: 'drawing-fill',
			type: 'fill',
			source: 'drawing',
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: { 'fill-color': css('--accent'), 'fill-opacity': 0.15 }
		});
		map.addLayer({
			id: 'drawing-line',
			type: 'line',
			source: 'drawing',
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: { 'line-color': css('--accent'), 'line-width': 2 }
		});
		map.addLayer({
			id: 'drawing-dot',
			type: 'circle',
			source: 'drawing',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-radius': 5,
				'circle-color': css('--accent'),
				'circle-stroke-color': css('--surface'),
				'circle-stroke-width': 2
			}
		});
		applySelection();
	}

	function applySelection() {
		if (!map || !map.getLayer('zone-selected')) return;
		map.setFilter('zone-selected', ['==', ['get', 'key'], selected?.kind === 'zone' ? selected.key : '']);
		map.setFilter('quake-selected', ['==', ['get', 'id'], selected?.kind === 'hazard' ? selected.id : '']);
		for (const [id, m] of markers)
			m.el.classList.toggle('selected', selected?.kind === 'hazard' && selected.id === id);
	}

	const ICON: Record<string, string> = {
		HURRICANE:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3.5a8.5 8.5 0 0 0-8 5.6"/><path d="M12 20.5a8.5 8.5 0 0 0 8-5.6"/><circle cx="12" cy="12" r="3.2"/></svg>',
		VOLCANO:
			'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 20.5h19l-6.2-10.2h-6.6z"/><path d="M10.5 8.2c-.3-1.6.4-3 1.6-3.6 1.1-.6 2.4-.3 3 .7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		FLOOD:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2.5 9.5c2.4-2 4.6-2 7 0s4.6 2 7 0 3.6-1.4 5 0"/><path d="M2.5 15.5c2.4-2 4.6-2 7 0s4.6 2 7 0 3.6-1.4 5 0"/></svg>',
		TSUNAMI:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 17c3-6 7-9 12-9-2 2-2 5 0 6 2 1 4 0 6-1"/></svg>',
		OTHER:
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v9"/><path d="M12 19h.01"/></svg>'
	};

	function syncMarkers() {
		if (!map || !ml) return;
		const wanted = new Map(hazards.filter((h) => h.category !== 'EARTHQUAKE').map((h) => [h.id, h]));
		for (const [id, m] of markers) {
			if (!wanted.has(id)) {
				m.marker.remove();
				markers.delete(id);
			}
		}
		for (const [id, h] of wanted) {
			if (markers.has(id)) continue;
			const el = document.createElement('button');
			el.type = 'button';
			el.className = `vigie-marker sev-${h.level ?? 'NONE'}`;
			el.setAttribute('aria-label', h.title);
			el.innerHTML = ICON[h.category] ?? ICON.OTHER;
			el.addEventListener('click', (event) => {
				event.stopPropagation();
				onselect?.({ kind: 'hazard', id });
			});
			markers.set(id, { el, marker: new ml.Marker({ element: el }).setLngLat([h.lon, h.lat]).addTo(map) });
		}
		applySelection();
	}

	// The measured wind: HTML badges, laid out again after each move (the strongest first, `declutter`). A badge opens a popup
	// with the station's details. Kept apart from the hazard markers, which stay on the map whatever the zoom.
	const windMarkers = new Map<string, { marker: Marker; el: HTMLButtonElement; key: string }>();
	let windPopup: import('maplibre-gl').Popup | null = null;

	const escapeHtml = (text: string) =>
		text.replace(
			/[&<>"']/g,
			(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!
		);

	function windSpeed(kmh: number) {
		const unit = wind?.unit ?? 'kmh';
		return tr('wind.speed', {
			value: String(windValue(kmh, unit)),
			unit: tr(unit === 'kn' ? 'wind.kn' : 'wind.kmh')
		});
	}

	function windName(p: WindPoint) {
		if (p.buoy) return tr('wind.buoyName', { name: p.name ?? '' });
		return p.name ?? tr('wind.noName');
	}

	function windLines(p: WindPoint): string[] {
		const time = windTime(lang, p.measured);
		return [
			p.fromDeg === null
				? tr('wind.calm', { speed: windSpeed(p.kmh) })
				: tr('wind.from', { speed: windSpeed(p.kmh), dir: compass(lang, p.fromDeg) }),
			...(p.gustKmh !== null ? [tr('wind.gusts', { speed: windSpeed(p.gustKmh) })] : []),
			p.buoy
				? tr('wind.buoy', { time })
				: p.altM !== null
					? tr('wind.station', { alt: String(p.altM), time })
					: tr('wind.stationNoAlt', { time })
		];
	}

	function openWindPopup(p: WindPoint, radius: number) {
		if (!map || !ml) return;
		windPopup?.remove();
		const [first, ...rest] = windLines(p);
		const html =
			`<strong>${escapeHtml(windName(p))}</strong><span>${escapeHtml(first)}</span>` +
			rest
				.map((line, i) => `<span${i === rest.length - 1 ? ' class="muted"' : ''}>${escapeHtml(line)}</span>`)
				.join('');
		windPopup = new ml.Popup({ offset: radius + 4, className: 'vigie-wind-popup', maxWidth: '260px' })
			.setLngLat([p.lon, p.lat])
			.setHTML(html)
			.addTo(map);
	}

	function syncWind() {
		if (!map || !ml) return;
		const points = wind?.points ?? [];
		if (!wind) {
			windPopup?.remove();
			windPopup = null;
		}
		const radius = badgeRadius(map.getZoom());
		const { clientWidth: w, clientHeight: h } = map.getContainer();
		const kept = declutter(
			points,
			(p) => {
				const xy = map!.project([p.lon, p.lat]);
				return xy.x < -radius || xy.y < -radius || xy.x > w + radius || xy.y > h + radius
					? null
					: [xy.x, xy.y];
			},
			radius
		);
		const wanted = new Map(kept.map((k) => [k.point.id, k.point]));
		for (const [id, m] of windMarkers) {
			if (!wanted.has(id)) {
				m.marker.remove();
				windMarkers.delete(id);
			}
		}
		const unit = wind?.unit ?? 'kmh';
		for (const [id, p] of wanted) {
			const key = [p.kmh, p.gustKmh, p.fromDeg, p.measured, unit, radius, lang].join('|');
			const known = windMarkers.get(id);
			if (known?.key === key) continue;
			// A badge drawn again (zoom, unit, new measure) keeps its element: MapLibre has added its own classes to it
			// (`maplibregl-marker`, absolute position), so its class is set once, never written over.
			const el = known?.el ?? document.createElement('button');
			if (!known) {
				el.type = 'button';
				el.classList.add('vigie-wind');
				el.dataset.testid = 'wind-badge';
			}
			el.setAttribute('aria-label', `${windName(p)} : ${windLines(p).slice(0, -1).join(', ')}`);
			el.innerHTML =
				windBadgeSvg(p, unit, radius) +
				(gustShown(p) ? `<span class="gust">${windValue(p.gustKmh as number, unit)}</span>` : '');
			el.style.setProperty('--r', `${radius}px`);
			el.onclick = (event) => {
				event.stopPropagation();
				openWindPopup(p, radius);
			};
			if (known) known.key = key;
			else
				windMarkers.set(id, {
					el,
					key,
					marker: new ml.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map)
				});
		}
	}

	// The labels of the sea map's spots: HTML, laid out again after each move (`keepLabels`), on the left of their dot.
	const pinMarkers = new Map<
		string,
		{ marker: Marker; el: HTMLButtonElement; key: string; side: 'left' | 'right' }
	>();
	const ARROW = '<path d="M8 13V3M4 7l4-4 4 4"/>';
	// The tide: a wave under an arrow that goes up or down, so that it is not taken for the wind's arrow beside it.
	const TIDE = {
		rising:
			'<path d="M1.5 14c1.6-1.2 3-1.2 4.4 0s2.8 1.2 4.2 0 2.8-1.2 4.4 0"/><path d="M8 10.5V2.5M5 5.5l3-3 3 3"/>',
		falling:
			'<path d="M1.5 14c1.6-1.2 3-1.2 4.4 0s2.8 1.2 4.2 0 2.8-1.2 4.4 0"/><path d="M8 2.5v8M5 7.5l3 3 3-3"/>'
	};

	function syncPins() {
		if (!map || !ml) return;
		const chosen = selected?.kind === 'spot' ? selected.id : null;
		const { clientWidth: w, clientHeight: h } = map.getContainer();
		const kept = keepLabels(
			pins ?? [],
			(p) => {
				const xy = map!.project([p.lon, p.lat]);
				return xy.x < 0 || xy.y < 0 || xy.x > w || xy.y > h ? null : [xy.x, xy.y];
			},
			chosen
		);
		const wanted = new Map(kept.map((k) => [k.pin.id, k]));
		for (const [id, m] of pinMarkers) {
			// A label that changes side is made again: the anchor of a marker is set when it is made.
			if (wanted.get(id)?.side !== m.side) {
				m.marker.remove();
				pinMarkers.delete(id);
			}
		}
		for (const [id, { pin: p, side }] of wanted) {
			const key = [p.text, p.wind, p.windFrom, p.tide, p.verdict, p.label, id === chosen].join('|');
			const known = pinMarkers.get(id);
			if (known?.key === key) continue;
			// As for the wind badges: an element drawn again keeps the classes MapLibre gave it.
			const el = known?.el ?? document.createElement('button');
			if (!known) {
				el.type = 'button';
				el.classList.add('vigie-pin');
				el.dataset.testid = 'sea-pin';
				el.dataset.spot = id;
			}
			el.classList.toggle('selected', id === chosen);
			el.setAttribute('aria-label', p.label);
			el.setAttribute('aria-pressed', String(id === chosen));
			const band = bandOf(p.verdict);
			el.innerHTML =
				`<span class="vd${band < 0 ? ' none' : ` surf-q${band}`}"></span>` +
				`<span class="tx">${escapeHtml(p.text ?? p.name)}</span>` +
				(p.wind ? `<span class="wn">${escapeHtml(p.wind)}</span>` : '') +
				(p.windFrom != null
					? `<svg class="wd" viewBox="0 0 16 16" style="transform:rotate(${Math.round(p.windFrom + 180)}deg)">${ARROW}</svg>`
					: '') +
				(p.tide ? `<svg class="td" viewBox="0 0 16 16">${TIDE[p.tide]}</svg>` : '');
			el.onclick = (event) => {
				event.stopPropagation();
				onselect?.({ kind: 'spot', id });
			};
			if (known) known.key = key;
			else
				pinMarkers.set(id, {
					el,
					key,
					side,
					marker: new ml.Marker({
						element: el,
						anchor: side === 'left' ? 'right' : 'left',
						offset: [side === 'left' ? -LABEL_OFFSET : LABEL_OFFSET, 0]
					})
						.setLngLat([p.lon, p.lat])
						.addTo(map)
				});
		}
	}

	// The forecast wind: a canvas of its own over the map's (`WindFlow`), made when there is a wind to draw and taken away after.
	let flowEngine: WindFlow | null = null;
	const flowColors = (): FlowColors => ({
		quiet: css('--flow'),
		strong: css('--wind-4'),
		stronger: css('--wind-5')
	});

	function syncFlow() {
		if (!map) return;
		if (!flow?.length) {
			flowEngine?.destroy();
			flowEngine = null;
			return;
		}
		flowEngine ??= new WindFlow(map, flowColors(), matchMedia('(prefers-reduced-motion: reduce)').matches);
		flowEngine.setGrids(flow);
	}

	function view(): Box {
		const b = map!.getBounds();
		return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
	}

	function onThemeChange() {
		if (!map) return;
		const next = theme();
		if (next === currentTheme) return;
		currentTheme = next;
		flowEngine?.recolor(flowColors());
		// The new style has none of the overlay until it has loaded (`addOverlay`).
		overlayAdded = false;
		map.setStyle(STYLE[next], { diff: false });
	}

	/** Frames a box (with a margin) or a point. */
	export function show(target: Box | [number, number], maxZoom = 7) {
		if (!map) return;
		const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
		if (target.length === 4) {
			map.fitBounds(
				[
					[target[0], target[1]],
					[target[2], target[3]]
				],
				{ padding: 40, maxZoom, duration }
			);
		} else {
			map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 4), duration });
		}
	}

	/**
	 * Brings a point out from under a card that covers the right or the bottom of the map (in pixels), keeping the zoom; a point
	 * already in the free part of the map does not move it.
	 */
	export function reveal(at: [number, number], cover: { right?: number; bottom?: number }) {
		if (!map) return;
		const { clientWidth: w, clientHeight: h } = map.getContainer();
		const margin = 48;
		const free = {
			x1: margin,
			x2: w - (cover.right ?? 0) - margin,
			y1: margin,
			y2: h - (cover.bottom ?? 0) - margin
		};
		const xy = map.project(at);
		const dx = free.x2 > free.x1 && (xy.x < free.x1 || xy.x > free.x2) ? xy.x - (free.x1 + free.x2) / 2 : 0;
		const dy = free.y2 > free.y1 && (xy.y < free.y1 || xy.y > free.y2) ? xy.y - (free.y1 + free.y2) / 2 : 0;
		if (!dx && !dy) return;
		map.easeTo({
			center: map.unproject([w / 2 + dx, h / 2 + dy]),
			duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500
		});
	}

	onMount(() => {
		let destroyed = false;
		(async () => {
			try {
				// The stylesheet (70 kB) arrives with the code instead of delaying the first paint of every page.
				const [lib] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
				ml = lib;
				if (destroyed) return;
				// MapLibre looks for its worker next to its own file, which a bundle does not keep.
				ml.setWorkerUrl(workerUrl);
				currentTheme = theme();
				map = new ml.Map({
					container,
					style: STYLE[currentTheme],
					center: [12, 25],
					zoom: container.clientWidth < 700 ? 0.6 : 1.4,
					minZoom: 0,
					maxZoom: 12,
					dragRotate: false,
					pitchWithRotate: false,
					attributionControl: { compact: true },
					// The words of MapLibre's own buttons, in the page's language.
					locale: {
						'Map.Title': label ?? tr('map.label'),
						'NavigationControl.ZoomIn': tr('map.zoomIn'),
						'NavigationControl.ZoomOut': tr('map.zoomOut'),
						'AttributionControl.ToggleAttribution': tr('map.attribution')
					}
				});
				// For the end-to-end tests only (a browser driven by them says so): the map, to read the order of its layers.
				if (navigator.webdriver) (window as unknown as { vigieMap?: MlMap }).vigieMap = map;
				map.touchZoomRotate.disableRotation();
				map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
				const first = frame ?? given;
				if (first) {
					const fit = () =>
						map?.fitBounds(
							[
								[first[0], first[1]],
								[first[2], first[3]]
							],
							{ padding: 30, duration: 0, maxZoom: 7 }
						);
					// A container with no size yet (a page still laying out, a hidden tab) cannot be framed:
					// it is framed at its first size instead of staying on the whole world.
					if (container.clientWidth > 60 && container.clientHeight > 60) fit();
					else map.once('resize', fit);
					lastFrame = first.join(',');
				}
				map.on('style.load', () => {
					localizeLabels();
					addOverlay();
					if (globeOn) map?.setProjection({ type: 'globe' });
					ready = true;
				});
				const pick = (layer: string, read: (p: Record<string, unknown>) => Selection) =>
					map!.on('click', layer, (e) => {
						const f = e.features?.[0];
						if (f) onselect?.(read(f.properties as Record<string, unknown>));
					});
				pick('quake', (p) => ({ kind: 'hazard', id: String(p.id) }));
				pick('zone-fill', (p) => ({ kind: 'zone', key: String(p.key) }));
				pick('zone-river', (p) => ({ kind: 'zone', key: String(p.key) }));
				pick('spot-dot', (p) => ({ kind: 'spot', id: String(p.id) }));
				for (const layer of ['fire-cell', 'fire-dot'])
					map.on('click', layer, (e) => {
						const f = e.features?.[0];
						if (f?.geometry.type !== 'Point') return;
						const [lon, lat] = f.geometry.coordinates;
						onselect?.({ kind: 'fire', lon, lat, props: { ...f.properties } });
					});
				map.on('click', 'tide-dot', (e) => {
					const f = e.features?.[0];
					if (f?.geometry.type !== 'Point') return;
					const [lon, lat] = f.geometry.coordinates;
					onselect?.({ kind: 'tide', lon, lat, props: { ...f.properties } });
				});
				for (const layer of [
					'quake',
					'zone-fill',
					'zone-river',
					'fire-cell',
					'fire-dot',
					'tide-dot',
					'spot-dot'
				]) {
					map.on('mouseenter', layer, () => (map!.getCanvas().style.cursor = 'pointer'));
					map.on('mouseleave', layer, () => (map!.getCanvas().style.cursor = onpick ? 'crosshair' : ''));
				}
				if (onpick) {
					map.getCanvas().style.cursor = 'crosshair';
					map.on('click', (e) => {
						const at = e.lngLat.wrap();
						onpick?.({ lat: at.lat, lon: at.lng });
					});
				}
				if (ontown) {
					// A click on the canvas only (a pin's click is its own), and not on a spot's dot.
					map.on('click', (e) => {
						if (e.originalEvent.target !== map!.getCanvas()) return;
						if (
							map!.getLayer('spot-dot') &&
							map!.queryRenderedFeatures(e.point, { layers: ['spot-dot'] }).length
						)
							return;
						const town = townAt(e.point);
						if (town) ontown?.(town);
					});
					let overTown = false;
					map.on('mousemove', (e) => {
						const over = townAt(e.point) !== null;
						if (over === overTown) return;
						overTown = over;
						map!.getCanvas().style.cursor = over ? 'pointer' : '';
					});
				}
				map.on('moveend', () => {
					onmove?.(view(), map!.getZoom());
					syncWind();
					syncPins();
				});
				map.once('idle', () => (drawn = true));
				map.on('load', () => {
					syncMarkers();
					onmove?.(view(), map!.getZoom());
				});
				observer = new MutationObserver(onThemeChange);
				observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
				media = matchMedia('(prefers-color-scheme: dark)');
				media.addEventListener('change', onThemeChange);
			} catch {
				failed = true;
			}
		})();
		return () => {
			destroyed = true;
		};
	});

	onDestroy(() => {
		rainPainter.destroy();
		observer?.disconnect();
		media?.removeEventListener('change', onThemeChange);
		flowEngine?.destroy();
		flowEngine = null;
		map?.remove();
		map = null;
	});

	$effect(() => {
		void zones;
		if (ready) syncZones();
	});
	$effect(() => {
		void hazards;
		if (ready && map?.getSource('quakes')) {
			(map.getSource('quakes') as GeoJSONSource).setData(quakes());
			syncMarkers();
		}
	});
	$effect(() => {
		void selected;
		if (ready) applySelection();
	});
	$effect(() => {
		void forecast;
		if (ready && map?.getSource('forecast'))
			(map.getSource('forecast') as GeoJSONSource).setData(forecastData());
	});
	$effect(() => {
		void aurora;
		if (ready && map?.getSource('aurora')) (map.getSource('aurora') as GeoJSONSource).setData(auroraData());
	});
	$effect(() => {
		void eclipse;
		if (ready && map?.getSource('eclipse'))
			(map.getSource('eclipse') as GeoJSONSource).setData(eclipseData());
	});
	$effect(() => {
		void fires;
		if (ready && map?.getSource('fires')) (map.getSource('fires') as GeoJSONSource).setData(fireData());
	});
	$effect(() => {
		void tides;
		if (ready && map?.getSource('tides')) (map.getSource('tides') as GeoJSONSource).setData(tideData());
	});
	$effect(() => {
		void radar;
		if (ready) syncRadar();
	});
	$effect(() => {
		void rainField;
		if (ready) syncRainField();
	});
	$effect(() => {
		void observedRain;
		if (ready) syncObservedRain();
	});
	$effect(() => {
		void relief;
		if (ready) syncRelief();
	});
	$effect(() => {
		void wind;
		void lang;
		if (ready) syncWind();
	});
	$effect(() => {
		void flow;
		if (ready) syncFlow();
	});
	$effect(() => {
		void spots;
		if (ready && map?.getSource('spots')) (map.getSource('spots') as GeoJSONSource).setData(spotData());
	});
	$effect(() => {
		void pins;
		void selected;
		if (ready) syncPins();
	});
	$effect(() => {
		void place;
		if (ready && map?.getSource('place')) (map.getSource('place') as GeoJSONSource).setData(placeData());
	});
	$effect(() => {
		void drawing;
		if (ready && map?.getSource('drawing'))
			(map.getSource('drawing') as GeoJSONSource).setData(drawingData());
	});
	// A new frame given after the map started (data loaded later): move to it once. A frame taken back (null)
	// leaves the map where it is, so the last one given is kept: a map that arrives after its frame was taken back
	// (a drawn zone chosen before MapLibre loaded) opens on it, where it would be had it been there from the start.
	let lastFrame = '';
	let given: Box | null = null;
	$effect(() => {
		const f = frame;
		if (f) given = f;
		if (!ready || !f) return;
		const key = f.join(',');
		if (key === lastFrame) return;
		lastFrame = key;
		show(f);
	});

	function toggleGlobe() {
		globeOn = !globeOn;
		map?.setProjection({ type: globeOn ? 'globe' : 'mercator' });
		// The trails start again in the new projection.
		if (flow?.length) {
			flowEngine?.setGrids([]);
			flowEngine?.setGrids(flow);
		}
	}
</script>

<svelte:head>
	<!-- The tiles, glyphs and sprites of the base map come from there: the connection opens while the page loads. -->
	<link rel="preconnect" href={BASEMAP_HOST} crossorigin="anonymous" />
	<!-- The relief's tiles come from the IGN (only when the page gives the map a relief). -->
	{#if relief}<link rel="preconnect" href={RELIEF_HOST} crossorigin="anonymous" />{/if}
</svelte:head>

<!-- data-ready: the base map is loaded and the map answers clicks (the end-to-end tests wait for it). -->
<div class="wrap" data-ready={ready || undefined}>
	<div class="map" bind:this={container} role="region" aria-label={label ?? tr('map.label')}></div>
	{#if failed}
		<p class="failed">{tr('map.failed')}</p>
	{:else if !drawn}
		<p class="loading" role="status">{tr('map.loading')}</p>
	{/if}
	{#if globe && !failed}
		<button type="button" class="globe" aria-pressed={globeOn} onclick={toggleGlobe}>{tr('map.globe')}</button
		>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: inherit;
		background: var(--map-land);
	}
	.map {
		position: absolute;
		inset: 0;
	}
	.loading {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		padding: 6px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--muted);
		font-size: 14px;
		pointer-events: none;
		white-space: nowrap;
	}
	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		text-align: center;
		color: var(--muted);
	}
	.globe {
		position: absolute;
		top: 84px;
		right: 10px;
		z-index: 2;
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: 4px;
		padding: 5px 8px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.globe[aria-pressed='true'] {
		background: var(--accent-soft);
		color: var(--accent);
		border-color: var(--accent);
	}
	/* The stacking of the map's own container: the warnings' markers (no z-index), the forecast wind's canvas, the measured
	   wind's badges, their card. Isolated, so that MapLibre's buttons and the site's cards stay over all of it, as before. */
	:global(.maplibregl-canvas-container) {
		isolation: isolate;
	}
	/* The forecast wind: over the map's canvas and the warnings' markers, under the measured wind, never in the way of a click. */
	:global(.vigie-flow) {
		z-index: 1;
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* No `position` here: the marker of MapLibre is absolute, which also places the gust. Over the forecast wind's trails. */
	:global(.vigie-wind) {
		z-index: 2;
		display: block;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		font-family: var(--font-body);
		line-height: 0;
	}
	:global(.vigie-wind svg) {
		display: block;
		filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.3));
	}
	:global(.vigie-wind .gust) {
		position: absolute;
		left: calc(50% + var(--r) * 0.55);
		top: calc(50% - var(--r) * 1.25);
		font-size: calc(var(--r) * 0.7);
		font-weight: 700;
		line-height: 1;
		color: var(--ink);
		text-shadow:
			0 0 2px var(--surface),
			0 0 2px var(--surface),
			0 0 3px var(--surface);
		pointer-events: none;
	}
	:global(.vigie-wind:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-radius: 50%;
	}
	:global(.vigie-wind-popup) {
		z-index: 3;
	}
	:global(.vigie-wind-popup .maplibregl-popup-content) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 26px 8px 10px;
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font: 13px/1.35 var(--font-body);
	}
	:global(.vigie-wind-popup .maplibregl-popup-content strong) {
		font-size: 14px;
	}
	:global(.vigie-wind-popup .muted) {
		color: var(--muted);
		font-size: 12px;
	}
	:global(.vigie-wind-popup .maplibregl-popup-tip) {
		display: none;
	}
	:global(.vigie-wind-popup .maplibregl-popup-close-button) {
		color: var(--muted);
		font-size: 18px;
	}
	/* The labels of the sea map: on the left of their dot, over the forecast wind's trails like the wind's badges. */
	:global(.vigie-pin) {
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		max-width: 190px;
		padding: 0 9px 0 7px;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		color: var(--ink);
		font: 600 13px/1 var(--font-body);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
	}
	:global(.vigie-pin:hover) {
		border-color: var(--accent);
	}
	:global(.vigie-pin.selected) {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
		z-index: 3;
	}
	:global(.vigie-pin:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	:global(.vigie-pin .vd) {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 30%, transparent);
	}
	:global(.vigie-pin .vd.none) {
		border: 1px dashed var(--muted);
		box-shadow: none;
	}
	:global(.vigie-pin .tx) {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* The wind of the hour after the figures of the surf or of shore fishing, parted from them by a dot. */
	:global(.vigie-pin .wn) {
		flex: none;
	}
	:global(.vigie-pin .wn)::before {
		content: '· ';
		color: var(--muted);
	}
	:global(.vigie-pin svg) {
		flex: none;
		width: 13px;
		height: 13px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	:global(.vigie-pin .td) {
		color: var(--accent);
	}
	:global(.vigie-marker) {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--surface);
		padding: 0;
		background: var(--c);
		color: var(--on-sev);
		display: grid;
		place-items: center;
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
	}
	:global(.vigie-marker.sev-YELLOW) {
		color: var(--on-yellow);
	}
	:global(.vigie-marker svg) {
		width: 16px;
		height: 16px;
	}
	:global(.vigie-marker.selected) {
		outline: 3px solid var(--ink);
		outline-offset: 1px;
	}
	:global(.maplibregl-ctrl-attrib) {
		font-size: 11px;
	}
</style>
