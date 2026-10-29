<script lang="ts">
	// The surf spots of the API on a map, each coloured by the rating of its current hour; near a place (a followed one, or the
	// visitor's position, asked on a click), the nearest first; then every spot, north to south, with its rating now and its
	// best slot of the next three days. A spot opens its forecast.
	import { onMount } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import { goto } from '$app/navigation';
	import Credits from '#lib/components/Credits.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import SurfSpotRow from '#lib/components/SurfSpotRow.svelte';
	import { readFollowed } from '#lib/followed.js';
	import type { Box } from '#lib/geo.js';
	import { band, spotsAround, surfText, type SurfSpotNow } from '#lib/surf.js';

	let { data } = $props();
	const lang = $derived(data.lang);

	// Without the overview, the plain list: no rating is made up.
	const spots: SurfSpotNow[] = $derived(
		data.overview?.spots ?? (data.spots?.spots ?? []).map((s) => ({ ...s, now: null, best: null }))
	);
	const features = $derived<FeatureCollection>({
		type: 'FeatureCollection',
		features: spots.map((s) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
			properties: { id: s.id, name: s.name, q: band(s.now?.rating ?? null) ?? -1 }
		}))
	});
	const frame = $derived.by((): Box | null => {
		if (!spots.length) return null;
		const lats = spots.map((s) => s.lat);
		const lons = spots.map((s) => s.lon);
		return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
	});

	// Near a place: the first followed place of this browser, or the position, asked only on a click. It stays in the browser.
	let me = $state<{ lat: number; lon: number; name: string | null } | null>(null);
	let locating = $state<'idle' | 'busy' | 'failed'>('idle');
	onMount(() => {
		const first = readFollowed()[0];
		if (first) me = { lat: first.lat, lon: first.lon, name: first.name };
	});
	function locate() {
		if (!('geolocation' in navigator)) {
			locating = 'failed';
			return;
		}
		locating = 'busy';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = 'idle';
				me = { lat: p.coords.latitude, lon: p.coords.longitude, name: null };
			},
			() => (locating = 'failed'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}
	const nearMe = $derived(me ? spotsAround(spots, me, null, 5) : []);
	const BANDS = [3, 2, 1, 0] as const;
</script>

<Seo title={surfText(lang, 'page')} description={surfText(lang, 'pageIntro')} />

<div class="page">
	<header class="intro">
		<h1>{surfText(lang, 'page')}</h1>
		<p class="muted">{surfText(lang, 'pageIntro')}</p>
		<p class="note">{surfText(lang, 'safety')}</p>
	</header>

	{#if spots.length}
		<section class="block">
			<h2>{surfText(lang, 'map')}</h2>
			<div class="map">
				<MapView
					{lang}
					spots={features}
					{frame}
					label={surfText(lang, 'map')}
					onselect={(s) => {
						if (s.kind === 'spot') goto(`/surf/${s.id}`);
					}}
				/>
			</div>
			{#if data.overview}
				<ul class="legend">
					{#each BANDS as q (q)}
						<li><span class="swatch surf-q{q}"></span>{surfText(lang, `band.${q}`)}</li>
					{/each}
					<li><span class="swatch surf-qn"></span>{surfText(lang, 'band.none')}</li>
				</ul>
				<p class="muted small">{surfText(lang, 'mapNote')}</p>
				{#if data.overview.stale}<p class="muted small">{surfText(lang, 'staleNote')}</p>{/if}
			{/if}
		</section>

		<section class="block">
			<h2>{surfText(lang, 'nearMe')}</h2>
			{#if me}
				<p class="muted small">
					{surfText(lang, 'from', { place: me.name ?? surfText(lang, 'myPosition') })}
				</p>
				<ul class="spots">
					{#each nearMe as s (s.id)}<li><SurfSpotRow {lang} spot={s} km={s.km} /></li>{/each}
				</ul>
			{/if}
			<p>
				<button type="button" class="btn quiet" onclick={locate} disabled={locating === 'busy'}
					>{surfText(lang, locating === 'busy' ? 'locating' : 'locate')}</button
				>
				{#if locating === 'failed'}<span class="muted small">{surfText(lang, 'locateFailed')}</span>{/if}
			</p>
		</section>

		<section class="block">
			<h2>{surfText(lang, 'spots')}</h2>
			<ul class="spots">
				{#each spots as s (s.id)}<li><SurfSpotRow {lang} spot={s} /></li>{/each}
			</ul>
			<p class="muted small">{surfText(lang, 'spotsNote')}</p>
		</section>
	{:else}
		<p class="note">{surfText(lang, 'unavailable')}</p>
	{/if}

	<Credits {lang} credits={[data.overview?.attribution ?? data.spots?.attribution]} />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.block h2 {
		margin: 0 0 8px;
	}
	.map {
		height: min(70vh, 560px);
		border-radius: var(--radius);
		overflow: hidden;
		margin-bottom: 8px;
	}
	.legend {
		list-style: none;
		margin: 0 0 6px;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		font-size: 14px;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
	}
	.spots {
		list-style: none;
		padding: 0;
		margin: 0 0 8px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 8px;
	}
</style>
