<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import FireDetails from '#lib/components/FireDetails.svelte';
	import TideSection from '#lib/components/TideSection.svelte';
	import { number } from '#lib/format.js';
	import { TideLayer } from '#lib/tideLayer.svelte.js';
	import ForecastDetails from '#lib/components/ForecastDetails.svelte';
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
	import { countriesNear, countryAt, placeHash, type Borders } from '#lib/near.js';
	import { placeLine, placeStatus, type PlaceStatus } from '#lib/placeStatus.js';
	import { untilPhrase } from '#lib/sentence.js';
	import { fireLevel, tilesInView } from '#lib/fires.js';
	import { boxesOverlap, coveredInView, geometryBox, grow, pointInBox, type Box } from '#lib/geo.js';
	import { countryName, t, tOr, translator, type Key } from '#lib/i18n.js';
	import { byLevelThenTime, LEVELS, maxLevel } from '#lib/levels.js';
	import { hazardHref, hazardRow, warningHref, warningRow, warningTitle, type Row } from '#lib/rows.js';
	import type { FireTile, Hazard, HazardForecast, Level, WarningDetail, WarningsData } from '#lib/types.js';

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
	$effect(() => {
		void tides.keys;
		untrack(() => tides.sync());
	});

	// --- warnings of the countries in view -------------------------------------------------------------
	const visibleCountries = $derived(
		view && zoom >= WARNINGS_MIN_ZOOM ? coveredInView(view, data.served) : []
	);

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
	// The country a place is in, from simplified borders (100 kB) loaded only when places are followed.
	$effect(() => {
		if (places.length && !borders)
			import('#lib/data/borders.json').then((m) => (borders = m.default as unknown as Borders));
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
	const zones = $derived.by((): FeatureCollection => {
		const features: Feature[] = [];
		if (hidden.has('VIGILANCE')) return { type: 'FeatureCollection', features };
		for (const cc of visibleCountries) {
			const state = countries.get(cc);
			if (!state?.data) continue;
			const byShape = new Map<string, Level[]>();
			for (const w of state.data.warnings) {
				if (!w.shape || !levels.has(levelKey(w.level))) continue;
				const list = byShape.get(w.shape) ?? [];
				list.push(w.level as Level);
				byShape.set(w.shape, list);
			}
			for (const [shape, list] of byShape) {
				features.push({
					type: 'Feature',
					geometry: state.data.shapes[shape],
					properties: { key: `${cc}|${shape}`, level: maxLevel(list) ?? 'NONE', n: list.length }
				});
			}
		}
		// Highest levels drawn last, on top.
		const rank = (f: Feature) => LEVELS.length - LEVELS.indexOf(f.properties?.level as Level);
		features.sort((a, b) => rank(a) - rank(b));
		return { type: 'FeatureCollection', features };
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
	const disclaimers = $derived([
		...new Set(
			[...shownCountries.map((cc) => countries.get(cc)?.data?.disclaimer), world?.disclaimer].filter(Boolean)
		)
	] as string[]);

	onMount(() => {
		if (!world) void loadWorld();
		void loadPlaces();
		const tick = setInterval(() => (now = Math.floor(Date.now() / 1000)), 60_000);
		const refresh = setInterval(async () => {
			try {
				const r = await fetch('/data/hazards.json');
				if (!r.ok) return;
				const value = await r.json();
				hazards = value.items;
				hazardsAttribution = value.attribution;
			} catch {
				// Keep the list we have; the next refresh tries again.
			}
			for (const cc of visibleCountries) void loadCountry(cc);
		}, 60_000);
		return () => {
			clearInterval(tick);
			clearInterval(refresh);
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

<h1 class="visually-hidden">Vigie · {tr('site.tagline')}</h1>

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
					<HazardFacts {lang} hazard={selectedHazard} />
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
		{:else}
			<section class="block point" aria-labelledby="point-title">
				<h2 id="point-title" class="eyebrow">{tr('point.title')}</h2>
				{#if world}
					<p class="said">{said.join(' ')}</p>
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
							<span class="n data">{levelCounts[level]}</span>
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
			<section class="block">
				<h2 class="eyebrow">{tr('types.title')}</h2>
				<div class="chips">
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
				<label class="check">
					<input type="checkbox" bind:checked={showFires} />
					<span class="swatch" aria-hidden="true"></span>
					{tr('fires.toggle')}
				</label>
				{#if showFires}
					{#if fireOff}
						<p class="hint">{tr('fires.off')}</p>
					{:else}
						<p class="hint">
							{tr('fires.legend', { h: fireFirst?.windowHours ?? 24 })}
							{#if fireLevelNow.cellDeg != null}{tr('fires.zoomIn')}{/if}
						</p>
						{#if fireShown.some((f) => f.status === 'loading')}<p class="hint">{tr('fires.loading')}</p>{/if}
						{#if fireShown.some((f) => f.status === 'error')}<p class="hint">{tr('fires.failed')}</p>{/if}
						{#if fireShown.some((f) => f.value?.truncated)}<p class="hint">{tr('fires.truncated')}</p>{/if}
						<p class="hint">{tr('fires.notAlert')}</p>
					{/if}
				{/if}
				<label class="check">
					<input type="checkbox" bind:checked={tides.on} />
					<span class="swatch tide" aria-hidden="true"></span>
					{tr('tide.toggle')}
				</label>
				{#if tides.on}
					<p class="hint">{tides.tooFar ? tr('tide.zoomIn') : tr('tide.legend')}</p>
					{#if tides.failed}<p class="hint">{tr('tide.layerFailed')}</p>{/if}
					<p class="hint">{tr('tide.limits')}</p>
				{/if}
			</section>
		{/if}
		<section class="credits">
			<h2 class="eyebrow">{tr('nav.sources')}</h2>
			{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}
			{#each disclaimers as d (d)}<p class="credit">{d}</p>{/each}
			{#if showFires && fireFirst}
				{#if fireFirst.attribution}<p class="credit">{fireFirst.attribution}</p>{/if}
				{#if fireFirst.disclaimer}<p class="credit">{fireFirst.disclaimer}</p>{/if}
			{/if}
			{#if tides.on && tides.attribution}<p class="credit">{tides.attribution}</p>{/if}
			<p class="credit">{tr('map.credit')}</p>
			<p class="credit">{tr('site.personal')} <a href="/about">{tr('nav.about')}</a></p>
		</section>
	</aside>
	<div class="mapwrap">
		<MapView
			bind:this={mapView}
			{lang}
			hazards={mapHazards}
			{zones}
			selected={mapSelected}
			forecast={forecast?.status === 'ok' ? forecast.value?.features : null}
			{fires}
			tides={tides.features}
			globe
			onselect={onMapSelect}
			onmove={(v, z) => {
				view = v;
				zoom = z;
			}}
		/>
	</div>
</div>

<style>
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
		flex-direction: column-reverse;
		flex: 1;
		min-height: 0;
	}
	.rail {
		min-width: 0;
		background: var(--surface);
		padding-block: 14px 24px;
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.mapwrap {
		height: 58vh;
		min-height: 320px;
		position: relative;
	}
	@media (min-width: 900px) {
		.app {
			display: grid;
			grid-template-columns: 410px minmax(0, 1fr);
		}
		.rail {
			overflow-y: auto;
			border-right: 1px solid var(--line);
			padding-left: 16px;
			padding-right: 16px;
		}
		.mapwrap {
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
	.check input {
		accent-color: var(--accent);
		width: 16px;
		height: 16px;
		margin: 0;
	}
	.swatch {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 50%;
		background: var(--fire);
	}
	.swatch.tide {
		background: var(--accent);
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
