<script lang="ts">
	// "Near me": the official warnings that hold a place, the hazards around it and its weather. The place is
	// chosen in the browser (position, click on the map, or the address of the page) and the matching is done
	// here, on the data every visitor loads; only a position rounded to the weather grid leaves the browser.
	import { onMount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import { replaceState } from '$app/navigation';
	import AlertRow from '$lib/components/AlertRow.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import PointWeather from '$lib/components/PointWeather.svelte';
	import { number } from '$lib/format';
	import { countryName, translator } from '$lib/i18n';
	import { byLevelThenTime, LEVELS, maxLevel } from '$lib/levels';
	import {
		circleBox,
		countriesNear,
		countryAt,
		hazardsNear,
		parsePlace,
		placeHash,
		snapToGrid,
		warningsAt,
		type Borders,
		type Place
	} from '$lib/near';
	import { hazardRow, warningRow } from '$lib/rows';
	import type { Level, PointWeather as Weather, WarningsData } from '$lib/types';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const RADII = [50, 100, 300, 500, 1000];

	let place = $state<Place | null>(null);
	let radiusKm = $state(300);
	let marine = $state(false);
	let locate = $state<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');

	const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

	function choose(next: Place) {
		place = { lat: round3(next.lat), lon: round3(next.lon) };
		replaceState(placeHash(place, radiusKm), {});
	}

	function setRadius(km: number) {
		radiusKm = km;
		if (place) replaceState(placeHash(place, radiusKm), {});
	}

	function readHash() {
		const read = parsePlace(location.hash);
		if (!read) return;
		place = { lat: read.lat, lon: read.lon };
		if (read.radiusKm && RADII.includes(read.radiusKm)) radiusKm = read.radiusKm;
	}

	function locateMe() {
		if (!('geolocation' in navigator)) {
			locate = 'unsupported';
			return;
		}
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				locate = 'idle';
				choose({ lat: position.coords.latitude, lon: position.coords.longitude });
			},
			() => (locate = 'denied'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	onMount(() => {
		readHash();
		window.addEventListener('hashchange', readHash);
		return () => window.removeEventListener('hashchange', readHash);
	});

	// --- official warnings of the countries around the place -------------------------------------------
	type CountryState = { status: 'loading' | 'ok' | 'error'; data?: WarningsData };
	const countries = new SvelteMap<string, CountryState>();
	const nearCountries = $derived(place ? countriesNear(place) : []);

	async function loadCountry(cc: string) {
		const previous = countries.get(cc);
		if (previous && previous.status !== 'error') return;
		countries.set(cc, { status: 'loading' });
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (!response.ok) throw new Error(String(response.status));
			countries.set(cc, { status: 'ok', data: (await response.json()) as WarningsData });
		} catch {
			countries.set(cc, { status: 'error' });
		}
	}

	$effect(() => {
		const wanted = nearCountries;
		// The loads read and write the states: untracked, so that a new state does not start them again.
		untrack(() => {
			for (const cc of wanted) void loadCountry(cc);
		});
	});

	const results = $derived.by(() => {
		const out = new Map<string, ReturnType<typeof warningsAt>>();
		if (!place) return out;
		for (const cc of nearCountries) {
			const state = countries.get(cc);
			if (state?.data) out.set(cc, warningsAt(state.data, place));
		}
		return out;
	});
	const here = $derived(
		[...results.values()]
			.flatMap((r) => r.here)
			.sort((a, b) => byLevelThenTime(warningRow(a.warning), warningRow(b.warning)))
	);
	// The country the place is in, from simplified borders loaded with the first place (100 kB): undefined
	// while they load, null outside every covered country.
	let borders = $state<Borders | null>(null);
	$effect(() => {
		if (place && !borders)
			import('$lib/data/borders.json').then((m) => (borders = m.default as unknown as Borders));
	});
	const country = $derived(place && borders ? countryAt(borders, place) : undefined);
	// Warnings without an area can only be said to concern the country the place is in.
	const unplaced = $derived(
		[...results.entries()]
			.filter(([cc, r]) => cc === country && r.unplaced.length > 0)
			.map(([cc, r]) => ({ cc, n: r.unplaced.length }))
	);
	const loading = $derived(nearCountries.filter((cc) => countries.get(cc)?.status === 'loading'));
	const failed = $derived(nearCountries.filter((cc) => countries.get(cc)?.status === 'error'));
	const credits = $derived([
		...new Set(
			[...results.entries()]
				.filter(([, r]) => r.here.length > 0)
				.flatMap(([cc]) => {
					const d = countries.get(cc)?.data;
					return d ? [...d.attributions, ...(d.disclaimer ? [d.disclaimer] : [])] : [];
				})
		)
	]);

	// --- hazards around ---------------------------------------------------------------------------------
	const near = $derived(place ? hazardsNear(data.hazards, place, radiusKm) : []);

	// --- weather of the grid point ---------------------------------------------------------------------
	let weather = $state<{
		key: string;
		status: 'loading' | 'ok' | 'error' | 'budget';
		value?: Weather & { stale?: boolean };
	} | null>(null);
	const cell = $derived(place ? snapToGrid(place) : null);

	async function loadWeather(key: string, at: Place, withSea: boolean) {
		weather = { key, status: 'loading' };
		try {
			const response = await fetch(
				`/data/point.json?lat=${at.lat}&lon=${at.lon}${withSea ? '&marine=1' : ''}`
			);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (weather?.key === key) weather = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			if (weather?.key === key) weather = { key, status: 'ok', value };
		} catch {
			if (weather?.key === key) weather = { key, status: 'error' };
		}
	}

	$effect(() => {
		const at = cell;
		const withSea = marine;
		if (!at) return;
		const key = `${at.lat},${at.lon},${withSea}`;
		untrack(() => {
			if (weather?.key !== key) void loadWeather(key, at, withSea);
		});
	});

	// --- map --------------------------------------------------------------------------------------------
	const zones = $derived.by((): FeatureCollection => {
		const byShape = new Map<string, { cc: string; shape: string; levels: Level[] }>();
		for (const h of here) {
			const { cc, shape, level } = h.warning;
			if (!shape) continue;
			const key = `${cc}:${shape}`;
			const entry = byShape.get(key) ?? { cc, shape, levels: [] };
			entry.levels.push(level as Level);
			byShape.set(key, entry);
		}
		const features: Feature[] = [];
		for (const [key, { cc, shape, levels }] of byShape) {
			const geometry = countries.get(cc)?.data?.shapes[shape];
			if (geometry)
				features.push({ type: 'Feature', geometry, properties: { key, level: maxLevel(levels) ?? 'NONE' } });
		}
		const rank = (f: Feature) => LEVELS.length - LEVELS.indexOf(f.properties?.level as Level);
		features.sort((a, b) => rank(a) - rank(b));
		return { type: 'FeatureCollection', features };
	});
	const frame = $derived(place ? circleBox(place, radiusKm) : null);
	const mapPlace = $derived(place ? { ...place, radiusKm } : null);

	const coord = (value: number, positive: string, negative: string) =>
		`${number(lang, Math.abs(value), 3)}° ${value >= 0 ? positive : negative}`;
	const km = (value: number) => number(lang, value, value < 10 ? 1 : 0);
</script>

<svelte:head>
	<title>Vigie · {tr('near.title')}</title>
	<meta name="description" content={tr('near.description')} />
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>{tr('near.title')}</h1>
		<p class="muted">{tr('near.privacy')}</p>
		{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	</header>

	<div class="controls">
		<button type="button" class="action" onclick={locateMe} disabled={locate === 'busy'}>
			{locate === 'busy' ? tr('near.locating') : tr('near.locate')}
		</button>
		<label class="field">
			<span>{tr('near.radius')}</span>
			<select value={radiusKm} onchange={(e) => setRadius(Number(e.currentTarget.value))}>
				{#each RADII as r (r)}<option value={r}>{r} km</option>{/each}
			</select>
		</label>
		<label class="field check">
			<input type="checkbox" bind:checked={marine} />
			<span>{tr('near.marine')}</span>
		</label>
	</div>
	{#if locate === 'denied'}
		<p class="note">{tr('near.denied')}</p>
	{:else if locate === 'unsupported'}
		<p class="note">{tr('near.unsupported')}</p>
	{/if}
	<p class="muted small">
		{#if place}
			{tr('near.place', {
				lat: coord(place.lat, 'N', 'S'),
				lon: coord(place.lon, 'E', lang === 'fr' ? 'O' : 'W')
			})}
			·
		{/if}
		{tr('near.pickHint')}
	</p>

	<div class="map">
		<MapView
			{lang}
			{zones}
			hazards={near.map((h) => h.hazard)}
			{frame}
			place={mapPlace}
			onpick={choose}
			label={tr('near.title')}
		/>
	</div>

	{#if !place}
		<p class="card">{tr('near.choose')}</p>
	{:else}
		<section class="block">
			<h2>{tr('near.warnings')}</h2>
			{#if nearCountries.length === 0 || (country === null && here.length === 0)}
				<p>{tr('near.noSource')} <a href="/countries">{tr('nav.countries')}</a></p>
			{:else}
				{#if loading.length}
					<p class="muted">
						{tr('list.loadingWarnings', { countries: loading.map((cc) => countryName(lang, cc)).join(', ') })}
					</p>
				{/if}
				{#if failed.length}
					<p class="note">
						{tr('list.failedWarnings', { countries: failed.map((cc) => countryName(lang, cc)).join(', ') })}
					</p>
				{/if}
				{#if here.length}
					<div class="list">
						{#each here as h (h.warning.cc + h.warning.id)}
							<div class="item">
								<AlertRow {lang} row={warningRow(h.warning)} now={data.now} />
								{#if h.distanceKm != null}
									<p class="muted small distance">
										{tr(h.river ? 'near.riverDistance' : 'near.areaMargin', { km: km(h.distanceKm) })}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				{:else if !loading.length && !failed.length && !unplaced.length}
					<p>{tr('near.warningsNone')}</p>
				{/if}
				{#each unplaced as u (u.cc)}
					<p class="muted small">
						{tr('near.unplaced', { n: u.n, country: countryName(lang, u.cc) })}
						<a href="/country/{u.cc.toLowerCase()}">{countryName(lang, u.cc)}</a>
					</p>
				{/each}
				{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}
			{/if}
		</section>

		<section class="block">
			<h2>{tr('near.hazards', { km: radiusKm })}</h2>
			{#if near.length}
				<div class="list">
					{#each near as h (h.hazard.id)}
						<div class="item">
							<AlertRow {lang} row={hazardRow(h.hazard)} now={data.now} />
							<p class="muted small distance">{tr('near.distance', { km: km(h.distanceKm) })}</p>
						</div>
					{/each}
				</div>
				{#if data.hazardsAttribution}<p class="credit">{data.hazardsAttribution}</p>{/if}
			{:else}
				<p>{tr('near.hazardsNone')}</p>
			{/if}
		</section>

		<section class="block">
			<h2>{tr('near.weather')}</h2>
			{#if cell}
				<p class="muted small">
					{tr('near.weatherCell', {
						lat: coord(cell.lat, 'N', 'S'),
						lon: coord(cell.lon, 'E', lang === 'fr' ? 'O' : 'W')
					})}
				</p>
			{/if}
			{#if weather?.status === 'ok' && weather.value}
				<PointWeather {lang} weather={weather.value} />
			{:else if weather?.status === 'budget'}
				<p class="note">{tr('near.weatherBudget')}</p>
			{:else if weather?.status === 'error'}
				<p class="note">{tr('near.weatherFailed')}</p>
			{:else}
				<p class="muted">{tr('detail.loading')}</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 16px;
		align-items: center;
	}
	.action {
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--surface);
		border-radius: var(--radius);
		padding: 8px 14px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.action:disabled {
		opacity: 0.7;
		cursor: progress;
	}
	.field {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
	.field select {
		font: inherit;
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
	}
	.map {
		height: min(60vh, 480px);
		min-height: 300px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.item {
		display: flex;
		flex-direction: column;
	}
	.distance {
		margin: -6px 0 6px 14px;
	}
</style>
