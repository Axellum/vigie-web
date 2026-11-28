<script lang="ts">
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import Time from '#lib/components/Time.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import FireDetails from '#lib/components/FireDetails.svelte';
	import TideSection from '#lib/components/TideSection.svelte';
	import FlowScale from '#lib/components/FlowScale.svelte';
	import LayerRow from '#lib/components/LayerRow.svelte';
	import LayersPanel from '#lib/components/LayersPanel.svelte';
	import MapRail, { type RailFamily } from '#lib/components/MapRail.svelte';
	import MomentBar from '#lib/components/MomentBar.svelte';
	import TownCard from '#lib/components/TownCard.svelte';
	import TownTip from '#lib/components/TownTip.svelte';
	import RadarCard from '#lib/components/RadarCard.svelte';
	import RainScale from '#lib/components/RainScale.svelte';
	import WindCard from '#lib/components/WindCard.svelte';
	import { number } from '#lib/format.js';
	import { TideLayer } from '#lib/tideLayer.svelte.js';
	import { IgnLayers } from '#lib/ignLayers.svelte.js';
	import { TownLayer } from '#lib/townLayer.svelte.js';
	import type { TownInView } from '#lib/townMarkers.js';
	import { rainShown } from '#lib/townWeather.js';
	import { pollWhileVisible } from '#lib/pollVisible.js';
	import { RadarLayer } from '#lib/radarLayer.svelte.js';
	import { RainFieldLayer } from '#lib/rainFieldLayer.svelte.js';
	import { ObservedRainLayer } from '#lib/observedRainLayer.svelte.js';
	import { formatObservedLatency } from '#lib/observedRain.js';
	import { radarTime, rate } from '#lib/radar.js';
	import { WindLayer } from '#lib/windLayer.svelte.js';
	import { nearestHour, WindFieldLayer } from '#lib/windFieldLayer.svelte.js';
	import { windTime } from '#lib/wind.js';
	import ForecastDetails from '#lib/components/ForecastDetails.svelte';
	import HerePanel from '#lib/components/HerePanel.svelte';
	import { PlaceState } from '#lib/placeState.svelte.js';
	import HazardFacts from '#lib/components/HazardFacts.svelte';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import MapView, { type Selection } from '#lib/components/MapView.svelte';
	import WarningBody from '#lib/components/WarningBody.svelte';
	import {
		eventInView,
		eventTitle,
		FAMILIES,
		familyLabel,
		hazardsOf,
		isWorldView,
		MIN_IMPACT,
		worldSentence,
		zoneSentence,
		type Family,
		type WorldEvent,
		type WorldEvents
	} from '#lib/events.js';
	import {
		applyFilter,
		filterQuery,
		folded,
		foldedSummary,
		isFiltered,
		KINDS,
		NO_FILTER,
		parseFilter,
		PERIODS,
		PROFILE_FILTERS,
		profileOf,
		type EventFilter
	} from '#lib/filters.js';
	import { readFollowed, sameSpot, type AccountPlace, type FollowedPlace } from '#lib/followed.js';
	import { PROFILES } from '#lib/profiles.js';
	import {
		countriesNear,
		countryAt,
		distanceKm,
		parsePlace,
		placeHash,
		warningsAt,
		type Borders,
		type Place
	} from '#lib/near.js';
	import { placeLine, placeStatus, type PlaceStatus } from '#lib/placeStatus.js';
	import { untilPhrase, type OfficialState } from '#lib/sentence.js';
	import { cardWarnings, type CardWarnings } from '#lib/widget/homeCard.js';
	import { fireLevel, tilesInView } from '#lib/fires.js';
	import { boxesOverlap, coveredInView, geometryBox, grow, pointInBox, type Box } from '#lib/geo.js';
	import { countryName, t, tOr, translator, type Key } from '#lib/i18n.js';
	import { byLevelThenTime, LEVELS } from '#lib/levels.js';
	import { hazardHref, hazardRow, warningHref, warningRow, warningTitle, type Row } from '#lib/rows.js';
	import type { FireTile, Hazard, HazardForecast, Level, WarningDetail, WarningsData } from '#lib/types.js';
	import { zoneFeatures } from '#lib/zoneFeatures.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	/** Zoom from which the official warnings of the countries in view are loaded. */
	// Low enough for the Europe and United States shortcuts on a laptop screen.
	const WARNINGS_MIN_ZOOM = 2.3;
	const WARNINGS_REFRESH_MS = 120_000;
	/** A country whose warnings failed is asked again after this delay, not at every move of the map. */
	const WARNINGS_RETRY_MS = 30_000;

	// Writable deriveds: they follow a new page load, and the browser refreshes them in between.
	let hazards = $derived<Hazard[]>(data.hazards?.items ?? []);
	let hazardsAttribution = $derived<string | null>(data.hazards?.attribution ?? null);
	let hazardsDisclaimer = $derived<string | null>(data.hazards?.disclaimer ?? null);
	let now = $derived(data.now);

	// --- the point: the API's events, the strongest first, of the area the map shows ---------------------------
	/** How many events the list shows before "show all". */
	const POINT_ROWS = 12;
	let view = $state<Box | null>(null);
	let zoom = $state(0);
	let world = $derived<WorldEvents | null>(data.events);
	let worldStatus = $state<'ok' | 'loading' | 'failed'>('ok');
	let allEvents = $state(false);
	let unfold = $state(false);
	// The fine filters, in the address: they act on the world already read, never on the API.
	// Read from the address once; a change of filter rewrites the address without a new page.
	let filter = $state(parseFilter(page.url.searchParams));
	// "The point" follows the map: the world's at the scale of the world, else the events that touch the area shown.
	const worldScale = $derived(isWorldView(view));
	const zoneEvents = $derived.by(() => {
		const v = view;
		if (!world) return [];
		return worldScale || !v ? world.events : world.events.filter((e) => eventInView(e, v));
	});
	const counting = $derived(zoneEvents.filter((e) => e.impact >= MIN_IMPACT));
	const listed = $derived(applyFilter(zoneEvents, filter, now));
	// Orange and red first; what is below is folded behind one line.
	const strong = $derived(listed.filter((e) => !folded(e)));
	const weak = $derived(listed.filter(folded));
	const families = $derived(
		FAMILIES.map((f) => ({ f, n: counting.filter((e) => e.family === f).length })).filter(
			({ f, n }) => n > 0 || filter.families.includes(f)
		)
	);

	function setFilter(next: EventFilter) {
		allEvents = false;
		unfold = false;
		filter = next;
		goto(`/${filterQuery(next)}${location.hash}`, { shallow: true, replace: true });
	}
	const toggleFamily = (f: Family) =>
		setFilter({
			...filter,
			families: filter.families.includes(f) ? filter.families.filter((x) => x !== f) : [...filter.families, f]
		});
	const pointRows = $derived(allEvents ? strong : strong.slice(0, POINT_ROWS));
	const said = $derived(
		world ? (worldScale ? worldSentence(lang, world, hazards) : zoneSentence(lang, zoneEvents, hazards)) : []
	);
	// Warnings with no known level count for little (impact 10): they are counted, not listed.
	const unknown = $derived(
		zoneEvents.filter((e) => e.kind === 'warnings' && !e.level && e.impact < MIN_IMPACT).length
	);
	const levelCounts = $derived(
		Object.fromEntries(LEVELS.map((l) => [l, zoneEvents.filter((e) => e.level === l).length]))
	);
	// The places followed in this browser, and those of the account signed in: cards, shortcuts to "near me".
	let places = $state<(FollowedPlace | AccountPlace)[]>([]);

	async function loadWorld() {
		worldStatus = 'loading';
		try {
			const response = await fetch('/data/events.json');
			if (!response.ok) throw new Error(String(response.status));
			world = (await response.json()) as WorldEvents;
			worldStatus = 'ok';
		} catch {
			worldStatus = 'failed';
		}
	}

	async function loadPlaces() {
		const own = readFollowed();
		places = own;
		if (!data.accounts) return;
		try {
			const response = await fetch('/account/places.json');
			if (!response.ok) return;
			const account = ((await response.json()) as { places: AccountPlace[] }).places;
			places = [...account, ...own.filter((p) => !account.some((a) => sameSpot(a, p)))];
		} catch {
			// The places of this browser are enough.
		}
	}

	// An event unfolds into what makes it: its official warnings, read with its country's, or its hazards.
	let opened = $state<string | null>(null);
	function toggleEvent(e: WorldEvent) {
		opened = opened === e.id ? null : e.id;
		if (opened && e.kind === 'warnings' && e.country && data.served.includes(e.country))
			void loadCountry(e.country);
	}
	function originRows(e: WorldEvent): Row[] {
		if (e.kind !== 'warnings') return hazardsOf(e, hazards).map(hazardRow);
		const ids = new Set(e.alertIds);
		return (countries.get(e.country ?? '')?.data?.warnings ?? [])
			.filter((w) => w.apiId != null && ids.has(w.apiId))
			.map(warningRow)
			.sort(byLevelThenTime);
	}
	const levels = new SvelteSet<Level | 'NONE'>([...LEVELS, 'NONE']);
	const hidden = new SvelteSet<string>();
	type CountryState = {
		status: 'loading' | 'ok' | 'error';
		data?: WarningsData;
		loadedAt: number;
		boxes?: Map<string, Box>;
	};
	const countries = new SvelteMap<string, CountryState>();
	let selection = $state<
		| { kind: 'hazard'; id: string }
		| { kind: 'zone'; cc: string; key: string }
		| { kind: 'warning'; cc: string; id: string }
		| { kind: 'fire'; lon: number; lat: number; props: Record<string, unknown>; cellDeg: number | null }
		| { kind: 'tide'; lon: number; lat: number }
		| null
	>(null);
	let detail = $state<{ key: string; status: 'loading' | 'ok' | 'error'; value?: WarningDetail } | null>(
		null
	);
	let mapView: MapView | undefined = $state();
	let rail: HTMLElement | undefined = $state();

	// --- active fires (off until asked: a detection is not an alert) -------------------------------------
	/** A tile of fires is asked again after this delay (the API reads the fires at most every hour). */
	const FIRES_REFRESH_MS = 600_000;
	let showFires = $state(false);
	type FireState = { status: 'loading' | 'ok' | 'off' | 'error'; value?: FireTile; at: number };
	const fireTiles = new SvelteMap<string, FireState>();
	const fireLevelNow = $derived(fireLevel(zoom));
	const fireKeys = $derived.by(() => {
		if (!showFires || !view) return [];
		const level = fireLevelNow;
		return (tilesInView(level, view) ?? []).map(([x, y]) => `${level.id}/${x}_${y}`);
	});

	async function loadFireTile(key: string) {
		fireTiles.set(key, { status: 'loading', value: fireTiles.get(key)?.value, at: Date.now() });
		try {
			const response = await fetch(`/data/fires/${key}.json`);
			if (response.status === 404) fireTiles.set(key, { status: 'off', at: Date.now() });
			else if (!response.ok) throw new Error(String(response.status));
			else fireTiles.set(key, { status: 'ok', value: (await response.json()) as FireTile, at: Date.now() });
		} catch {
			fireTiles.set(key, { status: 'error', at: Date.now() });
		}
	}

	$effect(() => {
		const keys = fireKeys;
		untrack(() => {
			const now = Date.now();
			for (const key of keys) {
				const known = fireTiles.get(key);
				const wait = known?.status === 'error' ? WARNINGS_RETRY_MS : FIRES_REFRESH_MS;
				if (!known || (known.status !== 'loading' && now - known.at > wait)) loadFireTile(key);
			}
		});
	});

	const fireShown = $derived(fireKeys.map((k) => fireTiles.get(k)).filter((f) => f !== undefined));
	const fires = $derived.by((): FeatureCollection | null => {
		if (!showFires) return null;
		const features: Feature[] = [];
		for (const f of fireShown) if (f.value) features.push(...f.value.features.features);
		return { type: 'FeatureCollection', features };
	});
	const fireFirst = $derived(fireShown.find((f) => f.value)?.value ?? null);
	const fireOff = $derived(fireShown.length > 0 && fireShown.every((f) => f.status === 'off'));

	// --- the tide along the coasts (computed by the API; off until asked) --------------------------------
	const tides = new TideLayer();
	$effect(() => tides.move(view, zoom));

	// --- the IGN's layers of France: relief, aerial photo, foreshores, beaches and ski lifts (the choices kept in this browser) ---
	const ign = new IgnLayers();
	onMount(() => ign.restore());

	// --- the rain radar (a card over the map, on while the map is on France or an overseas area it covers) ---------------------------
	const radar = new RadarLayer();
	$effect(() => radar.move(view, zoom));
	$effect(() => {
		void radar.wanted;
		void radar.area; // another area: its images are asked now
		untrack(() => radar.sync());
	});
	// An image comes every 5 minutes: the list is asked again then, not before (`RadarLayer.sync` keeps the delay).
	$effect(() => pollWhileVisible(() => radar.sync(), 60_000));
	$effect(() => () => radar.pause());

	// --- the forecast rain (Météo-France ARPEGE/AROME overlays; off until the visitor turns it on) ------------------------------
	const rainField = new RainFieldLayer();
	onMount(() => rainField.restore());
	$effect(() => rainField.move(view, zoom));
	$effect(() => {
		void rainField.on;
		untrack(() => rainField.sync());
	});
	$effect(() => pollWhileVisible(() => rainField.sync(), 60_000));

	// --- global observed satellite precipitation (NASA GIBS IMERG 30-min; off until the visitor turns it on) --------------------
	const observedRain = new ObservedRainLayer();
	onMount(() => observedRain.restore());
	$effect(() => {
		void observedRain.on;
		untrack(() => observedRain.sync());
	});
	$effect(() => pollWhileVisible(() => observedRain.sync(), 60_000));
	const observedRainMarks = $derived.by(() => {
		const classes = observedRain.data?.legend ?? [];
		const n = classes.length;
		const picks = [0, 2, 5, n - 1].filter((i, k, all) => i >= 0 && i < n && all.indexOf(i) === k);
		return picks.map((i) => ({ i, text: rate(lang, classes[i].minMmH) }));
	});
	const observedRainMeta = $derived.by(() => ({
		km: observedRain.data?.resolutionKm ?? null,
		delay:
			observedRain.data?.typicalLatencyMinutes != null
				? formatObservedLatency(observedRain.data.typicalLatencyMinutes)
				: null
	}));

	// --- the measured wind (stations and buoys; off until the visitor turns it on, the choice kept in this browser) ----------
	const wind = new WindLayer();
	onMount(() => wind.restore());
	$effect(() => wind.move(view, zoom));
	$effect(() => {
		void wind.on;
		void view;
		untrack(() => wind.sync());
	});
	// A new observation comes every 6 minutes: `WindLayer.sync` asks again then, not before.
	$effect(() => pollWhileVisible(() => wind.sync(), 60_000));
	// --- the forecast wind (Météo-France's models, drawn as trails; off until the visitor turns it on, kept in this browser) -----
	const flow = new WindFieldLayer();
	onMount(() => flow.restore());
	$effect(() => flow.move(view, zoom));
	$effect(() => {
		void flow.on;
		void flow.wanted; // a finer grid needed by the view: its image is asked now
		untrack(() => flow.sync());
	});
	// The list of the hour is asked again every 10 minutes and when the hour turns (`WindFieldLayer.sync` keeps the delays).
	$effect(() => pollWhileVisible(() => flow.sync(), 60_000));
	$effect(() => {
		void tides.keys;
		untrack(() => tides.sync());
	});

	// --- the weather of the towns the base map names (on until the visitor turns it off, the choice kept in this browser) ------
	const towns = new TownLayer();
	onMount(() => towns.restore());
	$effect(() => towns.move(zoom));
	$effect(() => {
		void towns.towns;
		void towns.on;
		void towns.near;
		untrack(() => towns.sync());
	});
	// A town's weather is asked again after a quarter of an hour (`TownLayer.sync` keeps the delay), "now" moves on each minute.
	$effect(() => pollWhileVisible(() => towns.sync(), 60_000));
	const townPills = $derived(
		towns.pills?.map((p) => {
			const r = p.reading;
			if (!r) return p;
			const parts = [
				tr('towns.pill', { name: p.name, t: r.temp == null ? '–' : number(lang, Math.round(r.temp) || 0, 0) })
			];
			if (rainShown(r)) parts.push(tr('towns.pillRain', { mm: number(lang, r.rainMm, 1) }));
			if (r.wind != null) parts.push(tr('towns.pillWind', { v: number(lang, r.wind, 0) }));
			return { ...p, label: parts.join(', ') };
		}) ?? null
	);
	// The short card under the pointer (not on a touch screen, where a tap opens the whole card), the whole card once clicked.
	let mapwrap: HTMLDivElement | undefined = $state();
	let townHover = $state<{ town: TownInView; left: number; top: number; above: boolean } | null>(null);
	let townPicked = $state<TownInView | null>(null);
	const TIP_W = 300;
	const TIP_H = 290;
	function onTownHover(id: string | null, at: DOMRect | null) {
		const town = id ? towns.towns.find((t) => t.id === id) : null;
		if (!town || !at || !mapwrap || townPicked || !matchMedia('(hover: hover)').matches) {
			townHover = null;
			return;
		}
		const box = mapwrap.getBoundingClientRect();
		const x = at.left - box.left + at.width / 2 - TIP_W / 2;
		const below = at.bottom - box.top + 8;
		const above = below + TIP_H > box.height && at.top - box.top - 8 - TIP_H >= 0;
		townHover = {
			town,
			left: Math.max(8, Math.min(x, box.width - TIP_W - 8)),
			top: above ? at.top - box.top - 8 : Math.min(below, Math.max(8, box.height - TIP_H - 8)),
			above
		};
	}
	function onTownPick(id: string) {
		townHover = null;
		townPicked = towns.towns.find((t) => t.id === id) ?? null;
	}
	const townHoverWeather = $derived(townHover ? towns.weatherOf(townHover.town) : null);
	// The palette of the cards follows the site's theme (the visitor's choice, else the system's).
	let dark = $state(false);
	onMount(() => {
		const read = () => {
			const set = document.documentElement.dataset.theme;
			dark = set === 'dark' || (set !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
		};
		read();
		const observer = new MutationObserver(read);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		const media = matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', read);
		return () => {
			observer.disconnect();
			media.removeEventListener('change', read);
		};
	});

	// --- "here": a place of the visitor's (their position or a place searched), its cards in the side panel, the map on it ------
	// The place is in the address (`#lat,lon,km`, as on "near me") and never leaves the browser but rounded, for the weather.
	const HERE_KM = 50;
	let herePlace = $state<Place | null>(null);
	let hereName = $state<string | null>(null);
	let hereOn = $state(false);
	let locate = $state<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
	const hereState = new PlaceState(() => ({
		place: hereOn ? herePlace : null,
		radiusKm: HERE_KM,
		profile: null,
		lang,
		now,
		hazards,
		hazardsAttribution,
		hazardsDisclaimer,
		served: data.served,
		uncovered: data.uncovered
	}));
	const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
	// A position has no name: the town the map names nearest to it, when there is one within a few kilometres.
	const HERE_NAME_KM = 8;
	const hereTown = $derived.by(() => {
		const at = herePlace;
		if (!at || hereName) return null;
		let best: { name: string; km: number } | null = null;
		for (const t of towns.towns) {
			const km = distanceKm(at, t);
			if (km <= HERE_NAME_KM && (!best || km < best.km)) best = { name: t.name, km };
		}
		return best?.name ?? null;
	});
	function setHere(at: Place, name: string | null) {
		herePlace = { lat: round3(at.lat), lon: round3(at.lon) };
		hereName = name;
		hereOn = true;
		locate = 'idle';
		selection = null;
		layerFamily = null;
		goto(`/${filterQuery(filter)}${placeHash(herePlace, HERE_KM)}`, { shallow: true, replace: true });
		// The map may not be drawn yet (a place in the address): it goes to the place on its first move.
		hereToShow = true;
		showHere();
		showRail();
	}
	let hereToShow = false;
	function showHere() {
		if (!hereToShow || !hereState.frame || !mapView?.made()) return;
		hereToShow = false;
		mapView.show(hereState.frame, 10);
	}
	function leaveHere() {
		hereOn = false;
		locate = 'idle';
		goto(`/${filterQuery(filter)}`, { shallow: true, replace: true });
	}
	function locateMe() {
		hereOn = true;
		selection = null;
		layerFamily = null;
		if (!navigator.geolocation) {
			locate = 'unsupported';
			return;
		}
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(pos) => setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude }, null),
			() => (locate = 'denied'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}
	function pickHere() {
		if (hereOn) leaveHere();
		else if (herePlace) setHere(herePlace, hereName);
		else locateMe();
	}
	onMount(() => {
		const at = parsePlace(location.hash);
		if (at) setHere(at, readFollowed().find((f) => sameSpot(f, at))?.name ?? null);
	});

	// --- the frame of the map: the families on its rail; those of layers open their choices over the map (as on the sea map) --
	// "Here" changes the side panel; the sky and travel are still pages of their own.
	type MapFamily = 'alerts' | 'weather' | 'sea' | 'map';
	let layerFamily = $state<MapFamily | null>(null);
	// How many layers of a family are shown; the warnings and the hazards are always there, the fires are counted.
	const layerCount = (f: MapFamily): number =>
		f === 'alerts'
			? Number(showFires)
			: f === 'weather'
				? Number(towns.on) +
					Number(radar.open && radar.covered) +
					Number(observedRain.on) +
					Number(rainField.on) +
					Number(flow.on) +
					Number(wind.on)
				: f === 'map'
					? ign.count
					: Number(tides.on);
	const layerFamilyOf = (f: MapFamily): RailFamily => ({
		id: f,
		icon: f === 'sea' ? 'tide' : f,
		label: tr(`frame.family.${f}` as Key),
		count: layerCount(f),
		countSaid: tr(layerCount(f) > 1 ? 'frame.countMany' : 'frame.count', { count: layerCount(f) }),
		on: f === 'alerts' || layerCount(f) > 0
	});
	const railFamilies = $derived<RailFamily[]>([
		{
			id: 'here',
			icon: 'here',
			label: tr('frame.family.here'),
			count: 0,
			countSaid: '',
			on: hereOn,
			current: hereOn,
			onpick: pickHere
		},
		layerFamilyOf('alerts'),
		layerFamilyOf('weather'),
		layerFamilyOf('sea'),
		{
			id: 'sky',
			icon: 'sky',
			label: tr('frame.family.sky'),
			count: 0,
			countSaid: '',
			on: false,
			href: '/sky'
		},
		{
			id: 'travel',
			icon: 'travel',
			label: tr('frame.family.travel'),
			count: 0,
			countSaid: '',
			on: false,
			href: '/travel'
		},
		layerFamilyOf('map')
	]);

	// --- warnings of the countries in view -------------------------------------------------------------
	// The same list as long as the same countries are in view: a move of the map inside them starts nothing again.
	let visibleLast: string[] = [];
	const visibleCountries = $derived.by(() => {
		const next = view && zoom >= WARNINGS_MIN_ZOOM ? coveredInView(view, data.served) : [];
		if (next.length !== visibleLast.length || next.some((cc, i) => cc !== visibleLast[i])) visibleLast = next;
		return visibleLast;
	});

	async function loadCountry(cc: string) {
		const previous = countries.get(cc);
		if (previous?.status === 'loading') return;
		const age = previous ? Date.now() - previous.loadedAt : Infinity;
		if (previous?.status === 'ok' && age < WARNINGS_REFRESH_MS) return;
		if (previous?.status === 'error' && age < WARNINGS_RETRY_MS) return;
		countries.set(cc, {
			...(previous ?? {}),
			status: previous?.data ? 'ok' : 'loading',
			loadedAt: Date.now()
		});
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as WarningsData;
			const boxes = new Map<string, Box>();
			for (const [key, geometry] of Object.entries(value.shapes)) {
				const box = geometryBox(geometry);
				if (box) boxes.set(key, box);
			}
			countries.set(cc, { status: 'ok', data: value, loadedAt: Date.now(), boxes });
		} catch {
			countries.set(cc, {
				status: previous?.data ? 'ok' : 'error',
				data: previous?.data,
				boxes: previous?.boxes,
				loadedAt: Date.now()
			});
		}
	}

	$effect(() => {
		const wanted = visibleCountries;
		// The loads read and write the country states: untracked, so that a new state does not start them again.
		untrack(() => {
			for (const cc of wanted) void loadCountry(cc);
		});
	});

	const loading = $derived(visibleCountries.filter((cc) => countries.get(cc)?.status === 'loading'));
	const failedCountries = $derived(visibleCountries.filter((cc) => countries.get(cc)?.status === 'error'));

	// --- the places followed: what is in force there, matched in this browser as "near me" does ---------------
	let borders = $state<Borders | null>(null);
	const placeCountries = $derived(places.map((p) => countriesNear(p, data.served)));
	$effect(() => {
		const wanted = new Set(placeCountries.flat());
		untrack(() => {
			for (const cc of wanted) void loadCountry(cc);
		});
	});
	// The country a place is in, from simplified borders (100 kB) loaded only when places are followed or a town's card is open.
	$effect(() => {
		if ((places.length || townPicked) && !borders)
			import('#lib/data/borders.json').then((m) => (borders = m.default as unknown as Borders));
	});
	// The official warnings of the town whose card is open, for the card as the widget gives them (`cardWarnings`): those of the
	// countries around it, which the map has mostly read already; null while one of them is still read (the card then waits).
	const townCountries = $derived(townPicked ? countriesNear(townPicked, data.served) : []);
	$effect(() => {
		const wanted = townCountries;
		untrack(() => {
			for (const cc of wanted) void loadCountry(cc);
		});
	});
	const townWarnings = $derived.by((): CardWarnings | null => {
		const town = townPicked;
		if (!town) return null;
		const here = townCountries
			.flatMap((cc) => {
				const d = countries.get(cc)?.data;
				return d ? warningsAt(d, town).here : [];
			})
			.sort((a, b) => byLevelThenTime(warningRow(a.warning), warningRow(b.warning)));
		const country = borders ? countryAt(borders, town) : undefined;
		let state: OfficialState;
		if (
			townCountries.length === 0 ||
			(here.length === 0 && (country === null || (country !== undefined && !data.served.includes(country))))
		)
			state = 'nosource';
		else if (here.length) state = 'warnings';
		else {
			const states = townCountries.map((cc) => countries.get(cc)?.status);
			if (states.includes('loading') || states.includes(undefined) || country === undefined) return null;
			state = states.includes('error') ? 'failed' : 'none';
		}
		const credits = new Set(
			townCountries.flatMap((cc) => {
				const d = countries.get(cc)?.data;
				return d && here.some((h) => h.warning.cc === cc)
					? [...d.attributions, ...(d.disclaimer ? [d.disclaimer] : [])]
					: [];
			})
		);
		return cardWarnings(state, here, lang, towns.now, [...credits].join(' · ') || null);
	});
	const cards = $derived(
		places.map((p, i) => {
			const status = placeStatus(
				p,
				placeCountries[i].map((cc) => ({ cc, state: countries.get(cc) })),
				borders ? countryAt(borders, p) : undefined,
				data.served
			);
			return { p, status, line: placeLine(lang, status, now) };
		})
	);
	// "Nothing in force" and "no source" are not levels: they never take a level's colour.
	const cardClass = (s: PlaceStatus) =>
		s.kind === 'here' || s.kind === 'country'
			? `sev-${s.level ?? 'NONE'}`
			: s.kind === 'none' || s.kind === 'nosource'
				? s.kind
				: 'sev-NONE';

	// --- what the map shows, by kind -----------------------------------------------------------------------
	const levelKey = (l: Level | null) => l ?? 'NONE';
	const allRows = $derived.by(() => {
		const rows: { row: Row; placed: boolean; inView: boolean }[] = [];
		for (const h of hazards) {
			rows.push({ row: hazardRow(h), placed: true, inView: !view || pointInBox(view, h.lon, h.lat) });
		}
		for (const cc of visibleCountries) {
			const state = countries.get(cc);
			if (!state?.data) continue;
			for (const w of state.data.warnings) {
				const box = w.shape ? state.boxes?.get(w.shape) : undefined;
				rows.push({
					row: warningRow(w),
					placed: !!w.shape,
					inView: !view || !box || boxesOverlap(view, box)
				});
			}
		}
		return rows;
	});

	const categories = $derived.by(() => {
		const order = [
			'VIGILANCE',
			'EARTHQUAKE',
			'HURRICANE',
			'VOLCANO',
			'FLOOD',
			'TSUNAMI',
			'TORNADO',
			'WILDFIRE',
			'EXTREME_RAIN',
			'SOLAR_STORM'
		];
		const present = new Set(allRows.map((r) => r.row.category));
		present.add('VIGILANCE');
		return [...present].sort((a, b) => ((order.indexOf(a) + 100) % 100) - ((order.indexOf(b) + 100) % 100));
	});
	const categoryCount = (c: string) =>
		allRows.filter((r) => r.row.category === c && (worldScale || !r.placed || r.inView)).length;

	// --- what the map draws -------------------------------------------------------------------------
	const mapHazards = $derived(
		hazards.filter((h) => !hidden.has(h.category) && levels.has(levelKey(h.level)))
	);
	// The zones of every country read so far, not only of those in view: a move of the map then changes nothing in this list,
	// and the map (which draws them from `WARNINGS_MIN_ZOOM`, highest level on top) is sent a country's zones once. A zone that
	// did not change is the same object from one list to the next, and the list itself is the same when no zone changed.
	const NO_ZONES: FeatureCollection = { type: 'FeatureCollection', features: [] };
	const zoneParts = new Map<string, { data: WarningsData; shown: string; features: Feature[] }>();
	let zonesLast = NO_ZONES;
	const zones = $derived.by((): FeatureCollection => {
		if (hidden.has('VIGILANCE')) return NO_ZONES;
		const shown = [...levels].sort().join();
		const features: Feature[] = [];
		for (const [cc, state] of countries) {
			if (!state.data) continue;
			let part = zoneParts.get(cc);
			if (part?.data !== state.data || part.shown !== shown) {
				part = {
					data: state.data,
					shown,
					features: zoneFeatures(cc, state.data, (l) => levels.has(levelKey(l)), part?.features)
				};
				zoneParts.set(cc, part);
			}
			for (const f of part.features) features.push(f);
		}
		const last = zonesLast.features;
		if (features.length !== last.length || features.some((f, i) => f !== last[i]))
			zonesLast = { type: 'FeatureCollection', features };
		return zonesLast;
	});
	const mapSelected = $derived.by((): Selection | null => {
		if (!selection) return null;
		if (selection.kind === 'hazard') return { kind: 'hazard', id: selection.id };
		if (selection.kind === 'fire' || selection.kind === 'tide') return null;
		if (selection.kind === 'zone') return { kind: 'zone', key: `${selection.cc}|${selection.key}` };
		const w = countries
			.get(selection.cc)
			?.data?.warnings.find((x) => x.id === (selection as { id: string }).id);
		return w?.shape ? { kind: 'zone', key: `${selection.cc}|${w.shape}` } : null;
	});

	// --- selection and detail ---------------------------------------------------------------------------
	function onMapSelect(s: Selection) {
		if (s.kind === 'hazard') selection = { kind: 'hazard', id: s.id };
		else if (s.kind === 'fire') selection = { ...s, cellDeg: fireLevelNow.cellDeg };
		else if (s.kind === 'tide') selection = { kind: 'tide', lon: s.lon, lat: s.lat };
		else if (s.kind === 'zone') {
			const [cc, key] = [s.key.slice(0, 2), s.key.slice(3)];
			const inZone = countries.get(cc)?.data?.warnings.filter((w) => w.shape === key) ?? [];
			selection = inZone.length === 1 ? { kind: 'warning', cc, id: inZone[0].id } : { kind: 'zone', cc, key };
		}
		showRail();
	}

	function pick(row: Row) {
		if (row.kind === 'hazard') {
			selection = { kind: 'hazard', id: row.hazard.id };
			mapView?.show([row.hazard.lon, row.hazard.lat]);
		} else {
			selection = { kind: 'warning', cc: row.warning.cc, id: row.warning.id };
			const box = row.warning.shape
				? countries.get(row.warning.cc)?.boxes?.get(row.warning.shape)
				: undefined;
			if (box) mapView?.show(box);
		}
		showRail();
	}

	function showRail() {
		if (!rail) return;
		if (window.innerWidth < 900) rail.scrollIntoView({ behavior: 'smooth', block: 'start' });
		else rail.scrollTop = 0;
	}

	$effect(() => {
		const s = selection;
		if (s?.kind !== 'warning') return;
		const key = `${s.cc}/${s.id}`;
		if (detail?.key === key) return;
		detail = { key, status: 'loading' };
		fetch(`/data/warning/${s.cc}/${encodeURIComponent(s.id)}.json`)
			.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
			.then((value: WarningDetail) => {
				if (detail?.key === key) detail = { key, status: 'ok', value };
			})
			.catch(() => {
				if (detail?.key === key) detail = { key, status: 'error' };
			});
	});

	const selectedHazard = $derived(
		selection?.kind === 'hazard' ? hazards.find((h) => h.id === (selection as { id: string }).id) : undefined
	);
	// The forecast of a selected storm or tsunami: drawn on the map, told in the panel.
	let forecast = $state<{ id: string; status: 'loading' | 'ok' | 'error'; value?: HazardForecast } | null>(
		null
	);
	async function loadForecast(id: string) {
		forecast = { id, status: 'loading' };
		try {
			const response = await fetch(`/data/forecast/${encodeURIComponent(id)}.json`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as HazardForecast;
			if (forecast?.id !== id) return;
			forecast = { id, status: 'ok', value };
			if (value.bbox) mapView?.show(grow(value.bbox, 0.1), 6);
		} catch {
			if (forecast?.id === id) forecast = { id, status: 'error' };
		}
	}
	$effect(() => {
		const h = selectedHazard;
		untrack(() => {
			if (!h?.hasForecast) forecast = null;
			else if (forecast?.id !== h.id) void loadForecast(h.id);
		});
	});

	const zoneWarnings = $derived.by(() => {
		const s = selection;
		if (s?.kind !== 'zone') return [];
		return (countries.get(s.cc)?.data?.warnings ?? [])
			.filter((w) => w.shape === s.key)
			.map(warningRow)
			.sort(byLevelThenTime);
	});
	const selectedWarning = $derived.by(() => {
		const s = selection;
		if (s?.kind !== 'warning') return undefined;
		return countries.get(s.cc)?.data?.warnings.find((w) => w.id === s.id);
	});
	const sameArea = $derived.by(() => {
		const w = selectedWarning;
		if (!w?.area) return [];
		return (countries.get(w.cc)?.data?.warnings ?? [])
			.filter((o) => o.id !== w.id && o.area === w.area)
			.map(warningRow)
			.sort(byLevelThenTime);
	});

	// --- shortcuts ----------------------------------------------------------------------------------------
	const VIEWS: { key: Key; box: Box }[] = [
		{ key: 'views.world', box: [-170, -58, 190, 75] },
		{ key: 'views.europe', box: [-25, 34, 45, 71] },
		{ key: 'views.france', box: [-5.5, 41.2, 9.8, 51.3] },
		{ key: 'views.usa', box: [-125, 24, -66, 50] },
		{ key: 'views.westPacific', box: [110, -48, 180, 40] }
	];

	// The countries whose warnings the page shows: on the map, in an event unfolded, on the cards of the places.
	const openedCountry = $derived(
		world?.events.find((e) => e.id === opened && e.kind === 'warnings')?.country ?? null
	);
	const shownCountries = $derived([
		...new Set([...visibleCountries, ...placeCountries.flat(), ...(openedCountry ? [openedCountry] : [])])
	]);
	const credits = $derived.by(() => {
		const set = new Set<string>();
		for (const part of (hazardsAttribution ?? '').split(' | ')) if (part) set.add(part);
		for (const cc of shownCountries) for (const a of countries.get(cc)?.data?.attributions ?? []) set.add(a);
		for (const e of [...pointRows, ...(unfold ? weak : [])]) if (e.attribution) set.add(e.attribution);
		return [...set];
	});
	const selectedHasFireNear = $derived(selectedHazard?.nearPlaces?.some((p) => p.kind === 'fire') ?? false);
	const anyHazardHasFireNear = $derived(hazards.some((h) => h.nearPlaces?.some((p) => p.kind === 'fire')));
	const disclaimers = $derived([
		...new Set(
			[
				...shownCountries.map((cc) => countries.get(cc)?.data?.disclaimer),
				world?.disclaimer,
				anyHazardHasFireNear ? hazardsDisclaimer : null
			].filter(Boolean)
		)
	] as string[]);

	onMount(() => {
		if (!world) void loadWorld();
		void loadPlaces();
		const tick = setInterval(() => (now = Math.floor(Date.now() / 1000)), 60_000);
		// Only while the tab is on screen; back from the background, the list is asked at once if it is a minute old.
		const stopRefresh = pollWhileVisible(async () => {
			try {
				const r = await fetch('/data/hazards.json');
				if (!r.ok) return;
				const value = await r.json();
				hazards = value.items;
				hazardsAttribution = value.attribution;
				hazardsDisclaimer = value.disclaimer ?? null;
			} catch {
				// Keep the list we have; the next refresh tries again.
			}
			for (const cc of visibleCountries) void loadCountry(cc);
		}, 60_000);
		return () => {
			clearInterval(tick);
			stopRefresh();
		};
	});
</script>

<Seo title={tr('nav.map')} description={tr('home.description')} />

<!-- What the site is, for search engines: a WebSite in schema.org terms. -->
<svelte:head>
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Vigie',
		url: `${data.origin}/`,
		description: tr('home.description'),
		inLanguage: lang
	}).replace(/</g, '\\u003c')}</script>`}
</svelte:head>

{#snippet eventItem(e: WorldEvent)}
	<li>
		<button
			type="button"
			class="event sev-{e.level ?? 'NONE'}"
			aria-expanded={opened === e.id}
			onclick={() => toggleEvent(e)}
		>
			<span class="t">{eventTitle(lang, e, hazards)}</span>
			<span class="m">
				{e.level ? t(lang, `level.${e.level}` as Key) : t(lang, 'level.none')}
				{#if e.end && e.end > now}· {untilPhrase(lang, e.end, now)}{/if}
				<!-- The hazards' sources by name (GDACS, USGS…); the warnings' sources are credited below. -->
				{#if e.kind !== 'warnings' && e.sources.length}· {e.sources.join(', ')}{/if}
			</span>
		</button>
		{#if opened === e.id}
			{@const rows = originRows(e)}
			{@const served = e.kind === 'warnings' && !!e.country && data.served.includes(e.country)}
			{@const state = served ? countries.get(e.country ?? '') : undefined}
			<div class="origin">
				{#if rows.length}
					<p class="small muted">
						{tr(e.kind === 'warnings' ? 'point.origin' : 'point.originHazards', { n: rows.length })}
					</p>
					<div class="list">
						{#each rows as row (row.key)}<AlertRow {lang} {row} {now} onpick={pick} />{/each}
					</div>
				{:else if e.kind !== 'warnings'}
					<p class="hint">{tr('point.noHazard')}</p>
				{:else if !served || state?.status === 'error'}
					<p class="hint">
						{tr('list.failedWarnings', { countries: e.country ? countryName(lang, e.country) : '–' })}
					</p>
				{:else if !state?.data}
					<p class="hint">
						{tr('list.loadingWarnings', { countries: e.country ? countryName(lang, e.country) : '–' })}
					</p>
				{:else}
					<p class="hint">{tr('point.changed')}</p>
				{/if}
				<div class="links">
					{#if e.bbox}
						<button type="button" class="btn quiet" onclick={() => e.bbox && mapView?.show(e.bbox, 6)}
							>{tr('point.show')}</button
						>
					{/if}
					{#if served && e.country}
						<a href="/country/{e.country.toLowerCase()}">{countryName(lang, e.country)}</a>
					{/if}
				</div>
			</div>
		{/if}
	</li>
{/snippet}

<div class="app">
	<section class="briefing" aria-labelledby="home-title">
		<div class="brief-title">
			<h1 id="home-title">{tr('home.localTitle')}</h1>
			<p>{tr('home.localDescription')}</p>
		</div>
		<div class="lookup">
			<PlaceSearch
				{lang}
				onpick={(p, label) => setHere(p, places.find((f) => sameSpot(f, p))?.name ?? label)}
			/>
		</div>
		<button type="button" class="local-link" onclick={locateMe} disabled={locate === 'busy'}
			>{locate === 'busy' ? tr('here.locating') : tr('nav.near')}</button
		>
	</section>
	<aside class="rail" bind:this={rail} aria-label={tr('list.title')}>
		{#if selection}
			<section class="detail">
				<button type="button" class="back" onclick={() => (selection = null)}>{tr('detail.back')}</button>
				{#if selection.kind === 'hazard' && selectedHazard}
					<div class="head">
						<LevelPill {lang} level={selectedHazard.level} />
						<h2>{selectedHazard.title}</h2>
						<p class="muted">{tOr(lang, `cat1.${selectedHazard.category}`, selectedHazard.category)}</p>
					</div>
					<HazardFacts
						{lang}
						hazard={selectedHazard}
						disclaimer={selectedHasFireNear ? hazardsDisclaimer : null}
					/>
					{#if selectedHazard.hasForecast}
						{#if forecast?.status === 'ok' && forecast.value}
							<ForecastDetails {lang} forecast={forecast.value} credited={selectedHazard.attribution} />
						{:else if forecast?.status === 'error'}
							<p class="muted">{tr('fc.failed')}</p>
						{:else}
							<p class="muted">{tr('fc.loading')}</p>
						{/if}
					{/if}
					<a href={hazardHref(selectedHazard)}>{tr('detail.open')}</a>
				{:else if selection.kind === 'fire'}
					<FireDetails
						{lang}
						lon={selection.lon}
						lat={selection.lat}
						props={selection.props}
						cellDeg={selection.cellDeg}
						windowHours={fireFirst?.windowHours ?? null}
					/>
				{:else if selection.kind === 'tide'}
					<p class="eyebrow">{tr('tide.source')}</p>
					<p class="muted small">
						{tr('tide.point', { lat: number(lang, selection.lat, 3), lon: number(lang, selection.lon, 3) })}
					</p>
					<TideSection {lang} at={{ lat: selection.lat, lon: selection.lon }} />
				{:else if selection.kind === 'zone'}
					<div class="head">
						<p class="eyebrow">{tr('detail.zone')} · {countryName(lang, selection.cc)}</p>
						<h2>{tr('detail.zoneWarnings', { n: zoneWarnings.length })}</h2>
					</div>
					<div class="list">
						{#each zoneWarnings as row (row.key)}
							<AlertRow {lang} {row} {now} onpick={pick} />
						{/each}
					</div>
				{:else if selection.kind === 'warning' && selectedWarning}
					<div class="head">
						<LevelPill {lang} level={selectedWarning.level} />
						<h2>{warningTitle(selectedWarning, lang)}</h2>
						<p class="muted">
							{[selectedWarning.area, countryName(lang, selectedWarning.cc)].filter(Boolean).join(' · ')}
						</p>
					</div>
					{#if detail?.status === 'ok' && detail.value}
						<WarningBody {lang} detail={detail.value} />
					{:else if detail?.status === 'error'}
						<p class="muted">{tr('detail.failed')}</p>
					{:else}
						<p class="muted">{tr('detail.loading')}</p>
					{/if}
					<a href={warningHref(selectedWarning)}>{tr('detail.open')}</a>
					{#if sameArea.length}
						<div class="list">
							<p class="small muted">{tr('detail.alsoHere', { area: selectedWarning.area ?? '' })}</p>
							{#each sameArea as row (row.key)}
								<AlertRow {lang} {row} {now} onpick={pick} />
							{/each}
						</div>
					{/if}
				{:else}
					<p class="muted">{tr('detail.failed')}</p>
				{/if}
			</section>
		{:else if hereOn}
			<section class="block">
				{#if herePlace}
					<HerePanel state={hereState} name={hereName ?? hereTown} radiusKm={HERE_KM} onback={leaveHere} />
				{:else}
					<p class="eyebrow">{tr('here.eyebrow')}</p>
					<p class="muted">
						{locate === 'busy'
							? tr('here.locating')
							: locate === 'denied'
								? tr('near.denied')
								: locate === 'unsupported'
									? tr('near.unsupported')
									: tr('near.choose')}
					</p>
					<button type="button" class="btn quiet" onclick={leaveHere}>{tr('here.back')}</button>
				{/if}
			</section>
		{:else}
			<section class="block point" aria-labelledby="point-title">
				<h2 id="point-title" class="eyebrow">{tr('point.title')}</h2>
				{#if world}
					<p class="said">{said.join(' ')}</p>
					{#if world.generated != null}
						<p class="stamp">{tr('home.asOf')} <Time {lang} unix={world.generated} /></p>
					{/if}
					{#if worldStatus === 'failed'}<p class="hint">{tr('home.refreshFailed')}</p>{/if}
					{#if world.missing.length}
						<p class="hint">
							{tr('point.missing', {
								sources: [
									...new Set(
										world.missing.map((m) =>
											m.country ? `${m.source} (${countryName(lang, m.country)})` : m.source
										)
									)
								].join(', ')
							})}
						</p>
					{/if}
				{:else if worldStatus === 'failed'}
					<p class="muted">{tr('point.failed')}</p>
				{:else}
					<p class="muted">{tr('point.loading')}</p>
				{/if}
				{#if cards.length}
					<nav class="places" aria-label={tr('near.followed')}>
						{#each cards as { p, status, line }, i (i)}
							<a class="place {cardClass(status)}" href="/near{placeHash(p, p.radiusKm, p.profile)}">
								<span class="name"
									><i class="dot" aria-hidden="true"></i>{p.name ?? `${p.lat}, ${p.lon}`}</span
								>
								<span class="line">{line}</span>
							</a>
						{/each}
					</nav>
				{/if}
			</section>
			{#if world}
				<section class="block" aria-labelledby="point-list">
					<h2 id="point-list" class="eyebrow">
						{tr('point.list')} · <span class="data">{listed.length}</span>
					</h2>
					<div class="chips" role="group" aria-label={tr('filter.profiles')}>
						{#each PROFILES as p (p)}
							<button
								type="button"
								class="chip"
								aria-pressed={profileOf(filter) === p}
								onclick={() => setFilter(profileOf(filter) === p ? NO_FILTER : PROFILE_FILTERS[p])}
								>{tr(`profile.${p}` as Key)}</button
							>
						{/each}
					</div>
					<details class="filters" open={isFiltered(filter) && !profileOf(filter)}>
						<summary>{tr('filter.title')}{isFiltered(filter) ? ` · ${tr('filter.active')}` : ''}</summary>
						<div class="stack">
							<div class="chips" role="group" aria-label={tr('filter.families')}>
								{#each families as { f, n } (f)}
									<button
										type="button"
										class="chip"
										aria-pressed={filter.families.includes(f)}
										onclick={() => toggleFamily(f)}
										>{familyLabel(lang, f)} <span class="count">{n}</span></button
									>
								{/each}
							</div>
							<label class="check">
								{tr('filter.level')}
								<select
									value={filter.level ?? ''}
									onchange={(e) =>
										setFilter({ ...filter, level: (e.currentTarget.value || null) as EventFilter['level'] })}
								>
									<option value="">{tr('filter.level.all')}</option>
									<option value="orange">{tr('filter.level.orange')}</option>
									<option value="red">{tr('filter.level.red')}</option>
								</select>
							</label>
							<div class="chips" role="group" aria-label={tr('filter.period')}>
								{#each [null, ...PERIODS] as p (p ?? 'all')}
									<button
										type="button"
										class="chip"
										aria-pressed={filter.period === p}
										onclick={() => setFilter({ ...filter, period: p })}
										>{tr(`filter.period.${p ?? 'all'}` as Key)}</button
									>
								{/each}
							</div>
							<div class="chips" role="group" aria-label={tr('filter.kind')}>
								{#each [null, ...KINDS] as k (k ?? 'all')}
									<button
										type="button"
										class="chip"
										aria-pressed={filter.kind === k}
										onclick={() => setFilter({ ...filter, kind: k })}
										>{tr(`filter.kind.${k ?? 'all'}` as Key)}</button
									>
								{/each}
							</div>
						</div>
					</details>
					{#if isFiltered(filter)}
						<button type="button" class="btn quiet" onclick={() => setFilter(NO_FILTER)}
							>{tr('filter.clear')}</button
						>
					{/if}
					<ol class="events">
						{#each pointRows as e (e.id)}{@render eventItem(e)}{/each}
					</ol>
					{#if !listed.length}
						<p class="muted">{isFiltered(filter) ? tr('filter.none') : tr('point.nothing')}</p>
					{:else if !strong.length}
						<p class="muted">{tr('point.noStrong')}</p>
					{/if}
					{#if strong.length > POINT_ROWS}
						<button type="button" class="btn quiet" onclick={() => (allEvents = !allEvents)}>
							{allEvents ? tr('point.less') : tr('point.more', { n: strong.length })}
						</button>
					{/if}
					{#if weak.length}
						<button type="button" class="fold" aria-expanded={unfold} onclick={() => (unfold = !unfold)}>
							<span aria-hidden="true">{unfold ? '−' : '+'}</span>
							{tr(unfold ? 'point.foldedOpen' : 'point.folded', { what: foldedSummary(lang, weak) })}
						</button>
						{#if unfold}
							<ol class="events">
								{#each weak as e (e.id)}{@render eventItem(e)}{/each}
							</ol>
						{/if}
					{/if}
					{#if unknown}<p class="hint">{tr('point.unknown', { n: unknown })}</p>{/if}
					{#if data.hazards === null}<p class="muted">{tr('error.api')}</p>{/if}
					{#if loading.length}
						<p class="hint">
							{tr('list.loadingWarnings', {
								countries: loading.map((cc) => countryName(lang, cc)).join(', ')
							})}
						</p>
					{/if}
					{#if failedCountries.length}
						<p class="hint">
							{tr('list.failedWarnings', {
								countries: failedCountries.map((cc) => countryName(lang, cc)).join(', ')
							})}
						</p>
					{/if}
					<p class="hint">{tr('point.note')}</p>
				</section>
			{/if}
			<section class="block">
				<h2 class="eyebrow">{tr('levels.title')}</h2>
				<div class="levels">
					<!-- No green counter: green is nothing in force (the audit); green zones stay drawn on the map. -->
					{#each LEVELS.filter((l) => l !== 'GREEN') as level (level)}
						<button
							type="button"
							class="level sev-{level}"
							aria-pressed={levels.has(level)}
							title={tr('levels.toggle', { level: t(lang, `level.${level}` as Key) })}
							onclick={() => (levels.has(level) ? levels.delete(level) : levels.add(level))}
						>
							<span class="n data">{world ? levelCounts[level] : '–'}</span>
							<span class="t">{t(lang, `level.${level}` as Key)}</span>
						</button>
					{/each}
				</div>
			</section>
			<section class="block">
				<h2 class="eyebrow">{tr('views.title')}</h2>
				<div class="chips">
					{#each VIEWS as v (v.key)}
						<button type="button" class="chip" onclick={() => mapView?.show(v.box, 6)}>{tr(v.key)}</button>
					{/each}
				</div>
			</section>
		{/if}
		<section class="credits">
			<h2 class="eyebrow">{tr('nav.sources')}</h2>
			{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}
			{#each disclaimers as d (d)}<p class="credit">{d}</p>{/each}
			{#if showFires && fireFirst}
				{#if fireFirst.attribution}<p class="credit">{fireFirst.attribution}</p>{/if}
				{#if fireFirst.disclaimer && !disclaimers.includes(fireFirst.disclaimer)}
					<p class="credit">{fireFirst.disclaimer}</p>
				{/if}
			{/if}
			{#if towns.on && towns.attribution}<p class="credit">{towns.attribution}</p>{/if}
			{#if tides.on && tides.attribution}<p class="credit">{tides.attribution}</p>{/if}
			{#if observedRain.on && observedRain.data?.attribution}<p class="credit">
					{observedRain.data.attribution}
				</p>{/if}
			{#if rainField.on && rainField.field?.attribution}<p class="credit">
					{rainField.field.attribution}
				</p>{/if}
			{#if flow.on && flow.field?.attribution}<p class="credit">{flow.field.attribution}</p>{/if}
			{#if wind.on && wind.data?.attribution}<p class="credit">{wind.data.attribution}</p>{/if}
			{#if radar.open && radar.covered && radar.data?.attribution}<p class="credit">
					{radar.data.attribution}
				</p>{/if}
			{#if radar.open && radar.covered && radar.nowcastAttribution}<p class="credit">
					{radar.nowcastAttribution}
				</p>{/if}
			<p class="credit">{tr('map.credit')}</p>
			{#if ign.on}<p class="credit">{tr('relief.credit')}</p>{/if}
			{#if ign.photo}<p class="credit">{tr('photo.credit')}</p>{/if}
			{#if ign.details}<p class="credit">{tr('details.credit')}</p>{/if}
			<p class="credit">{tr('site.personal')} <a href="/about">{tr('nav.about')}</a></p>
		</section>
	</aside>
	<div class="frame">
		<MapRail
			label={tr('frame.layers')}
			families={railFamilies}
			bind:open={() => layerFamily, (next) => (layerFamily = next as MapFamily | null)}
			controls="home-layers"
		/>
		<div class="mapwrap" bind:this={mapwrap} style:--map-foot={towns.on && towns.near ? '44px' : null}>
			<MapView
				bind:this={mapView}
				{lang}
				hazards={mapHazards}
				{zones}
				zonesFrom={WARNINGS_MIN_ZOOM}
				selected={mapSelected}
				forecast={forecast?.status === 'ok' ? forecast.value?.features : null}
				{fires}
				tides={tides.features}
				radar={radar.onMap(tr('radar.credit'))}
				rainField={rainField.onMap(tr('rainField.credit'))}
				observedRain={observedRain.onMap(tr('observedRain.credit'))}
				relief={ign.reliefOnMap(tr('relief.credit'))}
				photo={ign.photoOnMap(tr('photo.credit'))}
				details={ign.detailsOnMap(tr('details.credit'), {
					chairlift: tr('details.chairlift'),
					gondola: tr('details.gondola'),
					other: tr('details.lift')
				})}
				wind={wind.data ? { points: wind.data.points, unit: wind.unit } : null}
				flow={flow.grids}
				towns={townPills}
				ontowns={(list) => (towns.towns = list)}
				ontownhover={onTownHover}
				ontownpick={onTownPick}
				place={hereOn ? hereState.mapPlace : null}
				onpick={hereOn && !herePlace ? (at) => setHere(at, null) : undefined}
				globe
				onselect={onMapSelect}
				onmove={(v, z) => {
					view = v;
					zoom = z;
					showHere();
				}}
			/>
			<RadarCard {lang} {radar} />
			{#if towns.on && towns.near}
				<MomentBar {lang} choices={towns.choices} now={towns.now} bind:selected={towns.moment} />
			{/if}
			{#if townHover && townHoverWeather}
				<TownTip
					{lang}
					name={townHover.town.name}
					weather={townHoverWeather}
					now={towns.now}
					{dark}
					left={townHover.left}
					top={townHover.top}
					above={townHover.above}
				/>
			{/if}
			{#if townPicked}
				<TownCard
					{lang}
					name={townPicked.name}
					lat={townPicked.lat}
					lon={townPicked.lon}
					{dark}
					warnings={townWarnings}
					onclose={() => (townPicked = null)}
				/>
			{/if}
			<!-- The card of the measured wind holds the top left, where the layers of a family open: it comes back once folded. -->
			{#if !layerFamily}<WindCard {lang} {wind} />{/if}
			{#if !layerFamily && !wind.on && ((observedRain.on && observedRain.activeFrame) || (rainField.on && rainField.active))}
				<div class="map-badges">
					{#if observedRain.on && observedRain.activeFrame}
						<div class="rf-badge" role="status" data-testid="observed-rain-badge">
							<span class="eyebrow">
								{tr('observedRain.badge', {
									time: radarTime(lang, observedRain.activeFrame.timeUtc)
								})}
							</span>
							<span class="rf-badge-note">
								{#if observedRainMeta.km !== null && observedRainMeta.delay !== null}
									{tr('observedRain.notRadarShort', {
										km: observedRainMeta.km,
										delay: observedRainMeta.delay
									})}
								{:else}
									{tr('observedRain.notRadarShortPlain')}
								{/if}
							</span>
						</div>
					{/if}
					{#if rainField.on && rainField.active}
						<div class="rf-badge" role="status" data-testid="rain-field-badge">
							<span class="eyebrow">
								{tr('rainField.badge', {
									model: rainField.active.level.model,
									lead: rainField.active.frame.leadHours,
									time: windTime(lang, rainField.active.frame.validUtc)
								})}
							</span>
							<span class="rf-badge-note">{tr('rainField.notRadarShort')}</span>
						</div>
					{/if}
				</div>
			{/if}
			{#if layerFamily}
				<LayersPanel
					id="home-layers"
					title={tr(`frame.family.${layerFamily}` as Key)}
					closeLabel={tr('frame.close')}
					onclose={() => (layerFamily = null)}
				>
					{#if layerFamily === 'alerts'}
						<p class="small">{tr('frame.alertsDesc')}</p>
						<p class="muted small">{tr('frame.types')}</p>
						<div class="chips" role="group" aria-label={tr('frame.types')}>
							{#each categories as c (c)}
								<button
									type="button"
									class="chip"
									aria-pressed={!hidden.has(c)}
									onclick={() => (hidden.has(c) ? hidden.delete(c) : hidden.add(c))}
								>
									{tOr(lang, `cat.${c}`, c)} <span class="count">{categoryCount(c)}</span>
								</button>
							{/each}
						</div>
						<LayerRow
							name={tr('frame.fires')}
							source={tr('frame.firesSub')}
							testid="fires-toggle"
							bind:checked={showFires}
						/>
						{#if showFires}
							{#if fireOff}
								<p class="muted small">{tr('fires.off')}</p>
							{:else}
								<p class="muted small">
									{tr('fires.legend', { h: fireFirst?.windowHours ?? 24 })}
									{#if fireLevelNow.cellDeg != null}{tr('fires.zoomIn')}{/if}
								</p>
								{#if fireShown.some((f) => f.status === 'loading')}<p class="muted small">
										{tr('fires.loading')}
									</p>{/if}
								{#if fireShown.some((f) => f.status === 'error')}<p class="muted small">
										{tr('fires.failed')}
									</p>{/if}
								{#if fireShown.some((f) => f.value?.truncated)}<p class="muted small">
										{tr('fires.truncated')}
									</p>{/if}
								<p class="muted small">{tr('fires.notAlert')}</p>
							{/if}
						{/if}
					{:else if layerFamily === 'weather'}
						<p class="small">{tr('frame.weatherDesc')}</p>
						<LayerRow
							name={tr('towns.layer')}
							source={tr('towns.layerSub')}
							testid="towns-toggle"
							bind:checked={towns.on}
						/>
						{#if towns.on}
							<p class="muted small">{towns.near ? tr('towns.hint') : tr('towns.zoomIn')}</p>
							{#if towns.paused}<p class="muted small">{tr('towns.paused')}</p>{/if}
							{#if towns.failed}<p class="muted small">{tr('towns.failed')}</p>{/if}
						{/if}
						<h3 class="eyebrow layer-group">{tr('frame.rainTitle')}</h3>
						<p class="small">{tr('frame.rainDesc')}</p>
						<LayerRow
							name={tr('frame.radar')}
							source={tr('frame.radarSub')}
							testid="radar-toggle"
							bind:checked={radar.open}
						/>
						{#if radar.open}
							<p class="muted small" data-testid="radar-coverage">
								{tr(radar.covered ? 'frame.radarHint' : 'frame.radarNone')}
							</p>
						{/if}
						<LayerRow
							name={tr('frame.observed')}
							source={tr('frame.observedSub')}
							testid="observed-rain-toggle"
							bind:checked={observedRain.on}
						/>
						{#if observedRain.on}
							{#if observedRain.data?.status === 'off'}
								<p class="muted small">{tr('observedRain.off')}</p>
							{:else if observedRain.data?.status === 'unavailable' || (observedRain.status === 'failed' && !observedRain.data)}
								<p class="muted small">{tr('observedRain.failed')}</p>
							{:else if observedRain.activeFrame && observedRain.data}
								<div
									class="chips observed-frames"
									role="group"
									aria-label={tr('observedRain.frames')}
									data-testid="observed-rain-frames"
								>
									{#each observedRain.frames as f (f.stamp)}
										<button
											type="button"
											class="chip"
											aria-pressed={observedRain.activeFrame.stamp === f.stamp}
											data-stamp={f.stamp}
											onclick={() => observedRain.selectFrame(f.stamp)}
										>
											{radarTime(lang, f.timeUtc)}
										</button>
									{/each}
								</div>
								<p class="muted small" data-testid="observed-rain-legend">
									{#if observedRainMeta.km !== null && observedRainMeta.delay !== null}
										{tr('observedRain.legendMeta', {
											time: radarTime(lang, observedRain.activeFrame.timeUtc),
											km: observedRainMeta.km,
											delay: observedRainMeta.delay
										})}
									{:else}
										{tr('observedRain.legend', {
											time: radarTime(lang, observedRain.activeFrame.timeUtc)
										})}
									{/if}
								</p>
								{#if observedRain.data.legend.length}
									{@const hasSnow = observedRain.data.snowLegend.length > 0}
									<div class="rf-scale" class:with-label={hasSnow} data-testid="observed-rain-scale">
										{#if hasSnow}
											<div class="rf-scale-row">
												<span class="rf-scale-label">{tr('observedRain.rainScale')}</span>
												<div
													class="rf-bar"
													role="img"
													aria-label="{tr('observedRain.rainScale')}: {observedRain.data.legend
														.map((c) => `≥ ${rate(lang, c.minMmH)}`)
														.join(', ')}"
												>
													{#each observedRain.data.legend as c (c.minMmH)}<i style:background={c.color}
														></i>{/each}
												</div>
											</div>
											<div class="rf-scale-row">
												<span class="rf-scale-label">{tr('observedRain.snowScale')}</span>
												<div
													class="rf-bar"
													role="img"
													aria-label="{tr('observedRain.snowScale')}: {observedRain.data.snowLegend
														.map((c) => `≥ ${rate(lang, c.minMmH)}`)
														.join(', ')}"
												>
													{#each observedRain.data.snowLegend as c (c.minMmH)}<i style:background={c.color}
														></i>{/each}
												</div>
											</div>
											<div class="rf-scale-row">
												<span class="rf-scale-label" aria-hidden="true"></span>
												<div class="rf-marks" style:--n={observedRain.data.legend.length} aria-hidden="true">
													{#each observedRainMarks as m (m.i)}
														<span
															class:last={m.i === observedRain.data.legend.length - 1}
															style:grid-column={m.i === observedRain.data.legend.length - 1
																? `${Math.max(1, m.i - 1)} / ${m.i + 2}`
																: m.i + 1}
															>{m.text}{m.i === observedRain.data.legend.length - 1
																? ` ${tr('radar.unit')}`
																: ''}</span
														>
													{/each}
												</div>
											</div>
										{:else}
											<div
												class="rf-bar"
												role="img"
												aria-label="{tr('radar.legend')}: {observedRain.data.legend
													.map((c) => `≥ ${rate(lang, c.minMmH)}`)
													.join(', ')}"
											>
												{#each observedRain.data.legend as c (c.minMmH)}<i style:background={c.color}
													></i>{/each}
											</div>
											<div class="rf-marks" style:--n={observedRain.data.legend.length} aria-hidden="true">
												{#each observedRainMarks as m (m.i)}
													<span
														class:last={m.i === observedRain.data.legend.length - 1}
														style:grid-column={m.i === observedRain.data.legend.length - 1
															? `${Math.max(1, m.i - 1)} / ${m.i + 2}`
															: m.i + 1}
														>{m.text}{m.i === observedRain.data.legend.length - 1
															? ` ${tr('radar.unit')}`
															: ''}</span
													>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
								<p class="muted small" data-testid="observed-rain-disclaimer">
									{#if observedRainMeta.km !== null && observedRainMeta.delay !== null}
										{tr('observedRain.notRadar', { km: observedRainMeta.km, delay: observedRainMeta.delay })}
									{:else}
										{tr('observedRain.notRadarPlain')}
									{/if}
								</p>
							{:else}
								<p class="muted small">{tr('observedRain.loading')}</p>
							{/if}
						{/if}
						<LayerRow
							name={tr('frame.rainField')}
							source={tr('frame.rainFieldSub')}
							testid="rain-field-toggle"
							bind:checked={rainField.on}
						/>
						{#if rainField.on}
							{#if rainField.field?.status === 'off'}
								<p class="muted small">{tr('rainField.off')}</p>
							{:else if rainField.field?.status === 'unavailable' || (rainField.status === 'failed' && !rainField.field)}
								<p class="muted small">{tr('rainField.failed')}</p>
							{:else if rainField.active && rainField.field}
								<div
									class="chips"
									role="group"
									aria-label={tr('rainField.leads')}
									data-testid="rain-field-leads"
								>
									{#each rainField.leads as h (h)}
										<button
											type="button"
											class="chip"
											aria-pressed={rainField.leadHours === h}
											onclick={() => rainField.setLead(h)}
										>
											+{h} h
										</button>
									{/each}
								</div>
								<p class="muted small" data-testid="rain-field-legend">
									{tr('rainField.legend', {
										model: rainField.active.level.model,
										time: windTime(lang, rainField.active.frame.validUtc),
										lead: rainField.active.frame.leadHours
									})}
								</p>
								<RainScale {lang} legend={rainField.field.legend} testid="rain-field-scale" />
								<p class="muted small" data-testid="rain-field-disclaimer">{tr('rainField.notRadar')}</p>
							{:else}
								<p class="muted small">{tr('rainField.loading')}</p>
							{/if}
						{/if}
						<h3 class="eyebrow layer-group">{tr('frame.windTitle')}</h3>
						<p class="small">{tr('frame.windDesc')}</p>
						<LayerRow
							name={tr('frame.flow')}
							source={tr('frame.flowSub')}
							testid="flow-toggle"
							bind:checked={flow.on}
						/>
						{#if flow.on}
							{#if flow.field?.status === 'off'}
								<p class="muted small">{tr('flow.off')}</p>
							{:else if flow.field?.status === 'unavailable' || (flow.status === 'failed' && !flow.field)}
								<p class="muted small">{tr('flow.failed')}</p>
							{:else if flow.valid !== null}
								<p class="muted small" data-testid="flow-legend">
									{tr(
										flow.field?.stale || flow.valid !== nearestHour(Date.now())
											? 'flow.legendOld'
											: 'flow.legend',
										{
											time: windTime(lang, flow.valid)
										}
									)}
								</p>
								<FlowScale {lang} unit={wind.unit} />
								<p class="muted small">{tr('flow.note')}</p>
							{:else}
								<p class="muted small">{tr('flow.loading')}</p>
							{/if}
						{/if}
						<LayerRow
							name={tr('frame.measured')}
							source={tr('frame.measuredSub')}
							testid="wind-toggle"
							bind:checked={wind.on}
						/>
						{#if wind.on}
							<p class="muted small">{tr('wind.hint')}</p>
							<p class="muted small">{tr('wind.note')}</p>
						{/if}
					{:else if layerFamily === 'map'}
						<p class="small">{tr('frame.mapDesc')}</p>
						<LayerRow
							name={tr('frame.relief')}
							source={tr('frame.reliefSub')}
							testid="relief-toggle"
							bind:checked={ign.on}
						/>
						<LayerRow
							name={tr('frame.contours')}
							source={tr('frame.contoursSub')}
							testid="contours-toggle"
							disabled={!ign.on}
							bind:checked={ign.contours}
						/>
						<LayerRow
							name={tr('frame.photo')}
							source={tr('frame.photoSub')}
							testid="photo-toggle"
							bind:checked={ign.photo}
						/>
						<LayerRow
							name={tr('frame.details')}
							source={tr('frame.detailsSub')}
							testid="details-toggle"
							bind:checked={ign.details}
						/>
						<p class="muted small">{tr('relief.note')}</p>
					{:else}
						<p class="small">{tr('frame.tideDesc')}</p>
						<LayerRow
							name={tr('frame.tides')}
							source={tr('frame.tidesSub')}
							testid="tide-toggle"
							bind:checked={tides.on}
						/>
						{#if tides.on}
							<p class="muted small">{tides.tooFar ? tr('tide.zoomIn') : tr('tide.legend')}</p>
							{#if tides.failed}<p class="muted small">{tr('tide.layerFailed')}</p>{/if}
							<p class="muted small">{tr('tide.limits')}</p>
						{/if}
						<a class="small" href="/sea">{tr('frame.seaPage')}</a>
					{/if}
				</LayersPanel>
			{/if}
		</div>
	</div>
</div>

<style>
	.briefing {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(240px, 24rem) auto;
		align-items: center;
		gap: 1rem 2rem;
		padding: clamp(1rem, 2vw, 2rem) var(--gutter-r) clamp(1rem, 2vw, 2rem) var(--gutter);
		border-bottom: 1px solid var(--line);
		background: linear-gradient(108deg, var(--accent-soft), var(--surface) 72%);
	}
	.brief-title h1 {
		font: 700 clamp(1.8rem, 3vw, 3rem)/1 var(--font-display);
		margin: 0;
	}
	.brief-title p,
	.stamp {
		color: var(--muted);
		margin: 0.4rem 0 0;
	}
	.lookup {
		position: relative;
	}
	.lookup :global(.results) {
		position: absolute;
		z-index: 5;
		top: 100%;
		inset-inline: 0;
		max-height: 40vh;
		overflow-y: auto;
	}
	/* "Near me" acts on this map now ("here"): a button that reads as the link it was. */
	.local-link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}
	/* The groups of the weather family's layers: the towns, then the rain, then the wind. */
	.layer-group {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	.stamp {
		font-size: 0.875rem;
	}
	.point {
		padding: 1rem;
		border: 1px solid var(--line);
		border-top: 3px solid var(--accent);
		border-radius: var(--radius);
	}
	@media (max-width: 720px) {
		.briefing {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.75rem 1rem;
		}
		.brief-title {
			grid-column: 1/-1;
		}
	}
	.said {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 19px;
		line-height: 1.25;
		text-wrap: pretty;
	}
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.events li {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid var(--line);
		padding-bottom: 6px;
	}
	.event {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		border-left: 4px solid var(--c);
		padding: 8px 0 2px 10px;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
	}
	.event .t {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.event .m {
		font-size: 12.5px;
		color: var(--muted);
	}
	.filters summary {
		cursor: pointer;
		font-size: 13.5px;
		color: var(--accent);
	}
	.filters .stack {
		padding-top: 10px;
	}
	.origin {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 0 6px 14px;
	}
	.origin .links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		font-size: 13px;
	}
	.fold {
		align-self: flex-start;
		background: none;
		border: 0;
		padding: 4px 0;
		font: inherit;
		font-size: 13.5px;
		color: var(--accent);
		cursor: pointer;
		text-align: left;
	}
	.places {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 8px;
	}
	.place {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--ink);
		text-decoration: none;
	}
	.place:hover {
		border-color: var(--accent);
	}
	.place .name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.place .dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c, var(--sev-none));
	}
	.place.none .dot {
		background: transparent;
		box-shadow: inset 0 0 0 2px var(--calm-ink);
	}
	.place.nosource .dot {
		background: repeating-linear-gradient(135deg, var(--nosource-bg) 0 2px, var(--nosource-line) 2px 4px);
		box-shadow: inset 0 0 0 1px var(--nosource-line);
	}
	.place .line {
		font-size: 12.5px;
		color: var(--muted);
	}
	.app {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.rail {
		order: 2;
		min-width: 0;
		background: var(--surface);
		padding-block: 14px 24px;
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	/* The frame of the map: the rail of the families of layers (`MapRail`), a row over the map on a phone, a column on its left on
	   a computer; their choices open over the map. */
	.frame {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.mapwrap {
		height: 58vh;
		min-height: 320px;
		position: relative;
		min-width: 0;
	}
	@media (min-width: 900px) {
		.app {
			display: grid;
			grid-template-columns: 410px minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			grid-template-areas: 'briefing map' 'rail map';
		}
		.briefing {
			grid-area: briefing;
			grid-template-columns: minmax(0, 1fr) auto;
			padding: 1rem;
			gap: 0.65rem;
			border-right: 1px solid var(--line);
		}
		.brief-title {
			grid-column: 1/-1;
		}
		.brief-title h1 {
			font-size: 2rem;
		}
		.rail {
			grid-area: rail;
		}
		.frame {
			grid-area: map;
			flex-direction: row;
			min-height: 0;
		}
		.rail {
			overflow-y: auto;
			border-right: 1px solid var(--line);
			padding-left: 16px;
			padding-right: 16px;
		}
		.mapwrap {
			flex: 1;
			height: auto;
			min-height: 0;
		}
	}
	.block,
	.detail,
	.credits {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.credits {
		border-top: 1px solid var(--line);
		padding-top: 12px;
		gap: 6px;
	}
	.levels {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.level {
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 9px 9px 7px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--bg);
		cursor: pointer;
		text-align: left;
	}
	.level::before {
		content: '';
		position: absolute;
		inset: 0 0 auto 0;
		height: 4px;
		background: var(--c);
	}
	.level .n {
		font-size: 22px;
		font-weight: 500;
		line-height: 1.1;
	}
	.level .t {
		font-size: 12px;
		color: var(--muted);
	}
	.level[aria-pressed='false'] {
		opacity: 0.45;
	}
	.level[aria-pressed='false'] .n {
		text-decoration: line-through;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted);
		cursor: pointer;
	}
	.observed-frames .chip {
		padding: 3px 8px;
		font-size: 12px;
		font-family: var(--font-data);
	}
	.rf-scale {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.rf-scale-row {
		display: grid;
		grid-template-columns: 3.1rem minmax(0, 1fr);
		align-items: center;
		gap: 6px;
	}
	.rf-scale-label {
		font-size: 11px;
		color: var(--muted);
		line-height: 1.2;
	}
	.rf-bar {
		display: flex;
		height: 9px;
		border-radius: 5px;
		overflow: hidden;
		border: 1px solid var(--line);
	}
	.rf-bar i {
		flex: 1;
	}
	.rf-marks {
		display: grid;
		grid-template-columns: repeat(var(--n, 9), 1fr);
		font-size: 11px;
		color: var(--muted);
		line-height: 1.2;
	}
	.rf-marks .last {
		text-align: right;
		white-space: nowrap;
	}
	.map-badges {
		position: absolute;
		left: 10px;
		top: 10px;
		z-index: 3;
		max-width: calc(100% - 70px);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rf-badge {
		padding: 6px 10px;
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rf-badge-note {
		font-size: 11.5px;
		color: var(--muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.group {
		padding: 12px 0 4px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.empty {
		padding: 14px 0;
	}
	.hint {
		font-size: 13px;
		color: var(--muted);
		background: var(--bg);
		border-radius: var(--radius);
		padding: 8px 10px;
	}
	.back {
		align-self: flex-start;
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: var(--radius);
		padding: 5px 10px;
		cursor: pointer;
		font-size: 13px;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}
	.head h2 {
		font-size: 24px;
		overflow-wrap: anywhere;
	}
</style>
