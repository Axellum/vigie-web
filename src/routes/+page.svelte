<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import AlertRow from '$lib/components/AlertRow.svelte';
	import ForecastDetails from '$lib/components/ForecastDetails.svelte';
	import HazardFacts from '$lib/components/HazardFacts.svelte';
	import LevelPill from '$lib/components/LevelPill.svelte';
	import MapView, { type Selection } from '$lib/components/MapView.svelte';
	import WarningBody from '$lib/components/WarningBody.svelte';
	import { boxesOverlap, coveredInView, geometryBox, grow, pointInBox, type Box } from '$lib/geo';
	import { countryName, t, tOr, translator, type Key } from '$lib/i18n';
	import { byLevelThenTime, LEVELS, maxLevel } from '$lib/levels';
	import { hazardHref, hazardRow, warningHref, warningRow, warningTitle, type Row } from '$lib/rows';
	import type { Hazard, HazardForecast, Level, WarningDetail, WarningsData } from '$lib/types';

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
	let view = $state<Box | null>(null);
	let zoom = $state(0);
	let inView = $state(true);
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
		| null
	>(null);
	let detail = $state<{ key: string; status: 'loading' | 'ok' | 'error'; value?: WarningDetail } | null>(
		null
	);
	let mapView: MapView | undefined = $state();
	let rail: HTMLElement | undefined = $state();

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

	// --- rows ------------------------------------------------------------------------------------------
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
	const scoped = $derived(
		allRows.filter((r) => !hidden.has(r.row.category) && (!inView || !r.placed || r.inView))
	);
	const levelCounts = $derived(
		Object.fromEntries(
			[...LEVELS, 'NONE'].map((l) => [l, scoped.filter((r) => levelKey(r.row.level) === l).length])
		)
	);
	const shown = $derived(scoped.filter((r) => levels.has(levelKey(r.row.level))));
	const placedRows = $derived(
		shown
			.filter((r) => r.placed)
			.map((r) => r.row)
			.sort(byLevelThenTime)
	);
	const unplacedRows = $derived(
		shown
			.filter((r) => !r.placed)
			.map((r) => r.row)
			.sort(byLevelThenTime)
	);

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
		allRows.filter((r) => r.row.category === c && (!inView || !r.placed || r.inView)).length;

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
		if (selection.kind === 'zone') return { kind: 'zone', key: `${selection.cc}|${selection.key}` };
		const w = countries
			.get(selection.cc)
			?.data?.warnings.find((x) => x.id === (selection as { id: string }).id);
		return w?.shape ? { kind: 'zone', key: `${selection.cc}|${w.shape}` } : null;
	});

	// --- selection and detail ---------------------------------------------------------------------------
	function onMapSelect(s: Selection) {
		if (s.kind === 'hazard') selection = { kind: 'hazard', id: s.id };
		else {
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

	const credits = $derived.by(() => {
		const set = new Set<string>();
		for (const part of (hazardsAttribution ?? '').split(' | ')) if (part) set.add(part);
		for (const cc of visibleCountries)
			for (const a of countries.get(cc)?.data?.attributions ?? []) set.add(a);
		return [...set];
	});
	const disclaimers = $derived([
		...new Set(visibleCountries.map((cc) => countries.get(cc)?.data?.disclaimer).filter(Boolean))
	] as string[]);

	onMount(() => {
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

<svelte:head>
	<title>Vigie · {tr('nav.map')}</title>
	<meta name="description" content={tr('countries.intro')} />
</svelte:head>

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
			<section class="block">
				<h2 class="eyebrow">{tr('levels.title')}</h2>
				<div class="levels">
					{#each LEVELS as level (level)}
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
				<label class="check"><input type="checkbox" bind:checked={inView} /> {tr('types.inView')}</label>
			</section>
			<section class="block">
				<h2 class="eyebrow">{tr('list.title')} · <span class="data">{shown.length}</span></h2>
				{#if data.hazards === null}
					<p class="muted">{tr('error.api')}</p>
				{/if}
				{#if zoom < WARNINGS_MIN_ZOOM && !hidden.has('VIGILANCE')}
					<p class="hint">{tr('list.zoomForWarnings')}</p>
				{/if}
				{#if loading.length}
					<p class="hint">
						{tr('list.loadingWarnings', { countries: loading.map((cc) => countryName(lang, cc)).join(', ') })}
					</p>
				{/if}
				{#if failedCountries.length}
					<p class="hint">
						{tr('list.failedWarnings', {
							countries: failedCountries.map((cc) => countryName(lang, cc)).join(', ')
						})}
					</p>
				{/if}
				<div class="list">
					{#each placedRows as row (row.key)}
						<AlertRow {lang} {row} {now} onpick={pick} />
					{:else}
						<p class="muted empty">{tr('list.empty')}</p>
					{/each}
					{#if unplacedRows.length}
						<p class="group">{tr('list.unplaced')} · {unplacedRows.length} ({tr('list.unplacedWhy')})</p>
						{#each unplacedRows as row (row.key)}
							<AlertRow {lang} {row} {now} onpick={pick} />
						{/each}
					{/if}
				</div>
			</section>
		{/if}
		<section class="credits">
			<h2 class="eyebrow">{tr('nav.sources')}</h2>
			{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}
			{#each disclaimers as d (d)}<p class="credit">{d}</p>{/each}
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
