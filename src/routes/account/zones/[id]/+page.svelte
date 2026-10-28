<script lang="ts">
	import MapView from '#lib/components/MapView.svelte';
	import { countryBox, type Box } from '#lib/geo.js';
	import { translator, type Key } from '#lib/i18n.js';
	import { circleBox } from '#lib/near.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const z = $derived(data.zone);

	const frame = $derived.by((): Box | null => {
		if (z.corners?.length) {
			const lons = z.corners.map((c) => c[0]);
			const lats = z.corners.map((c) => c[1]);
			return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
		}
		if (z.lat != null && z.lon != null && z.radiusKm)
			return circleBox({ lat: z.lat, lon: z.lon }, z.radiusKm);
		return z.country ? countryBox(z.country) : null;
	});
</script>

<svelte:head>
	<title>Vigie · {z.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/account#zones">{tr('zones.title')}</a></p>
		<h1>{z.name}</h1>
		<p class="muted small">
			{tr(`zones.level.${z.minLevel}` as Key)} · {z.kinds.map((k) => tr(`cat.${k}` as Key)).join(', ')}
		</p>
	</header>
	<div class="map">
		<MapView
			{lang}
			{frame}
			drawing={z.corners}
			place={z.lat != null && z.lon != null ? { lat: z.lat, lon: z.lon, radiusKm: z.radiusKm } : null}
		/>
	</div>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.map {
		height: 480px;
	}
</style>
