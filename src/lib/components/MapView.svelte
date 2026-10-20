<script lang="ts" module>
	export type Selection =
		| { kind: 'hazard'; id: string }
		| { kind: 'zone'; key: string }
		| { kind: 'fire'; lon: number; lat: number; props: Record<string, unknown> };
</script>

<script lang="ts">
	// The map: OpenFreeMap base map, official warning zones (polygons or river sections) and hazards.
	// MapLibre (code and stylesheet) is loaded after the page is shown, so that the text of the page comes first.
	import { onDestroy, onMount } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import type { Map as MlMap, Marker, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
	import { translator, type Lang } from '$lib/i18n';
	import type { Box } from '$lib/geo';
	import { circleRing, type Place } from '$lib/near';
	import type { Hazard } from '$lib/types';

	interface Props {
		lang: Lang;
		hazards?: Hazard[];
		zones?: FeatureCollection;
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
		onselect?: (selection: Selection) => void;
		onmove?: (view: Box, zoom: number) => void;
		/** When given, a click on the map chooses a place. */
		onpick?: (place: Place) => void;
	}

	let {
		lang,
		hazards = [],
		zones = { type: 'FeatureCollection', features: [] },
		selected = null,
		frame = null,
		globe = false,
		label,
		place = null,
		drawing = null,
		forecast = null,
		fires = null,
		onselect,
		onmove,
		onpick
	}: Props = $props();

	const tr = $derived(translator(lang));
	const STYLE = {
		light: 'https://tiles.openfreemap.org/styles/positron',
		dark: 'https://tiles.openfreemap.org/styles/dark'
	};

	let container: HTMLDivElement;
	let map: MlMap | null = null;
	let ml: typeof import('maplibre-gl') | null = null;
	let failed = $state(false);
	let ready = $state(false);
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
	const kindIs = (...kinds: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', kinds]];

	function addForecastLayers() {
		if (!map) return;
		const ink = css('--ink');
		map.addLayer({
			id: 'fc-cone',
			type: 'fill',
			source: 'forecast',
			filter: kindIs('cone'),
			paint: { 'fill-color': ink, 'fill-opacity': 0.12 }
		});
		map.addLayer({
			id: 'fc-cone-edge',
			type: 'line',
			source: 'forecast',
			filter: kindIs('cone'),
			paint: { 'line-color': ink, 'line-width': 1.2, 'line-dasharray': [2, 2] }
		});
		// The NHC's own colours for its coastal watches and warnings.
		map.addLayer({
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
		map.addLayer({
			id: 'fc-track',
			type: 'line',
			source: 'forecast',
			filter: kindIs('track'),
			paint: { 'line-color': ink, 'line-width': 2 }
		});
		map.addLayer({
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

	function addOverlay() {
		if (!map) return;
		// The base map in the site's own land and water colors (the dark style has almost no contrast
		// between them at world scale).
		if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', css('--map-land'));
		if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', css('--map-water'));
		map.addSource('zones', { type: 'geojson', data: zones });
		map.addSource('quakes', { type: 'geojson', data: quakes() });
		map.addSource('place', { type: 'geojson', data: placeData() });
		map.addSource('forecast', { type: 'geojson', data: forecastData() });
		map.addSource('fires', { type: 'geojson', data: fireData() });
		map.addLayer({
			id: 'zone-fill',
			type: 'fill',
			source: 'zones',
			filter: isArea,
			paint: { 'fill-color': levelColor('level'), 'fill-opacity': 0.4 }
		});
		map.addLayer({
			id: 'zone-outline',
			type: 'line',
			source: 'zones',
			filter: isArea,
			paint: { 'line-color': levelColor('level'), 'line-width': 0.9 }
		});
		map.addLayer({
			id: 'zone-river',
			type: 'line',
			source: 'zones',
			filter: isLine,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': levelColor('level'),
				'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 9, 6]
			}
		});
		map.addLayer({
			id: 'zone-selected',
			type: 'line',
			source: 'zones',
			filter: ['==', ['get', 'key'], ''],
			paint: { 'line-color': css('--ink'), 'line-width': 2.5 }
		});
		addFireLayers();
		map.addLayer({
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

	function view(): Box {
		const b = map!.getBounds();
		return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
	}

	function onThemeChange() {
		if (!map) return;
		const next = theme();
		if (next === currentTheme) return;
		currentTheme = next;
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

	onMount(() => {
		let destroyed = false;
		(async () => {
			try {
				// The stylesheet (70 kB) arrives with the code instead of delaying the first paint of every page.
				const [lib] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
				ml = lib;
				if (destroyed) return;
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
					attributionControl: { compact: true }
				});
				map.touchZoomRotate.disableRotation();
				map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
				if (frame) {
					const first = frame;
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
					lastFrame = frame.join(',');
				}
				map.on('style.load', () => {
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
				for (const layer of ['fire-cell', 'fire-dot'])
					map.on('click', layer, (e) => {
						const f = e.features?.[0];
						if (f?.geometry.type !== 'Point') return;
						const [lon, lat] = f.geometry.coordinates;
						onselect?.({ kind: 'fire', lon, lat, props: { ...f.properties } });
					});
				for (const layer of ['quake', 'zone-fill', 'zone-river', 'fire-cell', 'fire-dot']) {
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
				map.on('moveend', () => onmove?.(view(), map!.getZoom()));
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
		observer?.disconnect();
		media?.removeEventListener('change', onThemeChange);
		map?.remove();
		map = null;
	});

	$effect(() => {
		const data = zones;
		if (ready && map?.getSource('zones')) (map.getSource('zones') as GeoJSONSource).setData(data);
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
		void fires;
		if (ready && map?.getSource('fires')) (map.getSource('fires') as GeoJSONSource).setData(fireData());
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
	// A new frame given after the map started (data loaded later): move to it once.
	let lastFrame = '';
	$effect(() => {
		const f = frame;
		if (!ready || !f) return;
		const key = f.join(',');
		if (key === lastFrame) return;
		lastFrame = key;
		show(f);
	});

	function toggleGlobe() {
		globeOn = !globeOn;
		map?.setProjection({ type: globeOn ? 'globe' : 'mercator' });
	}
</script>

<!-- data-ready: the base map is loaded and the map answers clicks (the end-to-end tests wait for it). -->
<div class="wrap" data-ready={ready || undefined}>
	<div class="map" bind:this={container} role="region" aria-label={label ?? tr('map.label')}></div>
	{#if failed}
		<p class="failed">{tr('map.failed')}</p>
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
		background: var(--bg);
	}
	.map {
		position: absolute;
		inset: 0;
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
