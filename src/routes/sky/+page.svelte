<script lang="ts">
	// The sky: where the aurora is now (NOAA's OVATION oval), the magnetic activity of the next days (NOAA's Kp),
	// and, for a place chosen in the browser, the API's estimate of the coming night.
	import Credits from '#lib/components/Credits.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import NearSky from '#lib/components/NearSky.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { dateTime, number } from '#lib/format.js';
	import type { Box } from '#lib/geo.js';
	import { snapToGrid, type Place } from '#lib/near.js';
	import { eclipseText } from '#lib/eclipse.js';
	import { activityWords, sky } from '#lib/sky.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const aurora = $derived(data.aurora);
	const oval = $derived(data.oval);

	let place = $state<Place | null>(null);
	let placeCredit = $state<string | null>(null);
	let placeName = $state<string | null>(null);
	let locate = $state<'idle' | 'busy' | 'denied'>('idle');
	const cell = $derived(place ? snapToGrid(place) : null);
	const mapPlace = $derived(place ? { ...place, radiusKm: null } : null);
	// The northern oval and Europe at first (most visitors); around the place once one is chosen. A globe on demand.
	const frame = $derived<Box>(
		place
			? [place.lon - 25, Math.max(-85, place.lat - 12), place.lon + 25, Math.min(85, place.lat + 14)]
			: [-45, 38, 60, 80]
	);

	function choose(next: Place, name: string | null = null) {
		place = { lat: Math.round(next.lat * 1000) / 1000, lon: Math.round(next.lon * 1000) / 1000 };
		placeName = name;
	}

	function locateMe() {
		if (!('geolocation' in navigator)) return;
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locate = 'idle';
				choose({ lat: p.coords.latitude, lon: p.coords.longitude });
			},
			() => (locate = 'denied'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	// The Kp of the last day and of the next three, as bars (NOAA's values; the colours follow its G scale from Kp 5).
	const bars = $derived(aurora ? aurora.kp.filter((k) => k.end > data.now - 24 * 3600) : []);
	const W = 720,
		H = 140,
		PAD = 22;
	const barWidth = $derived(bars.length ? (W - PAD) / bars.length : 0);
	const y = (kp: number) => H - 18 - (kp / 9) * (H - 30);
	const colour = (kp: number) =>
		kp >= 7 ? '#e8462c' : kp >= 5 ? '#f2a22e' : kp >= 4 ? '#e8d23a' : '#3ccf6e';
	const activity = $derived(aurora ? activityWords(lang, aurora.kpMax24h) : null);
	const dayLabel = (unix: number) =>
		new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short', day: 'numeric' }).format(
			new Date(unix * 1000)
		);
</script>

<Seo title={sky(lang, 'page')} description={sky(lang, 'pageIntro')} />

<div class="page">
	<header class="intro">
		<h1>{sky(lang, 'page')}</h1>
		<p class="muted">{sky(lang, 'pageIntro')}</p>
		<p><a href="/sky/eclipses">{eclipseText(lang, 'link')} →</a></p>
	</header>

	<section class="card pick">
		<h2>{sky(lang, 'tonight')}</h2>
		<div class="row">
			<PlaceSearch {lang} id="sky-place" onpick={(p, label) => choose(p, label)} />
			<button type="button" onclick={locateMe} disabled={locate === 'busy'}>{sky(lang, 'myPosition')}</button>
		</div>
		{#if locate === 'denied'}<p class="muted small">{sky(lang, 'positionDenied')}</p>{/if}
		{#if placeName}<p class="muted small">{placeName}</p>{/if}
		{#if cell}
			<NearSky {lang} {cell} bare onattribution={(a) => (placeCredit = a)} />
		{:else}
			<p class="muted">{sky(lang, 'pickPlace')}</p>
		{/if}
	</section>

	<section class="block">
		<h2>{sky(lang, 'layer')}</h2>
		<div class="map">
			<MapView
				{lang}
				aurora={oval?.features ?? null}
				{frame}
				globe
				place={mapPlace}
				onpick={(p) => choose(p)}
				label={sky(lang, 'layer')}
			/>
		</div>
		{#if oval?.forecast}
			<p class="muted small">{sky(lang, 'layerNote', { time: dateTime(lang, oval.forecast) })}</p>
		{:else}
			<p class="note">{sky(lang, 'unavailable')}</p>
		{/if}
	</section>

	{#if aurora}
		<section class="block">
			<h2>{sky(lang, 'kpChart')}</h2>
			{#if activity}<p>
					<strong>{activity}</strong> <span class="muted">{sky(lang, 'activityNext')}</span>
				</p>{/if}
			{#if bars.length}
				<div class="chart">
					<svg viewBox="0 0 {W} {H}" role="img" aria-label={sky(lang, 'kpChart')}>
						{#each [0, 3, 5, 7, 9] as level (level)}
							<line x1={PAD} x2={W} y1={y(level)} y2={y(level)} class="grid" />
							<text x="0" y={y(level) + 4} class="axis">{level}</text>
						{/each}
						{#each bars as k, i (k.start)}
							<rect
								x={PAD + i * barWidth + 1}
								y={y(k.kp)}
								width={Math.max(1, barWidth - 2)}
								height={H - 18 - y(k.kp)}
								fill={colour(k.kp)}
								opacity={k.kind === 'predicted' ? 0.55 : 1}
							>
								<title
									>{dateTime(lang, k.start)} · Kp {number(lang, k.kp)} ({sky(lang, `kind.${k.kind}`)}){k.scale
										? ` · ${k.scale}`
										: ''}</title
								>
							</rect>
							{#if new Date(k.start * 1000).getUTCHours() === 0}
								<text x={PAD + i * barWidth} y={H - 4} class="axis">{dayLabel(k.start)}</text>
							{/if}
						{/each}
					</svg>
				</div>
				<p class="muted small">{sky(lang, 'kpLegend')}</p>
			{/if}
			{#if aurora.wind}
				<p>
					{sky(lang, 'wind')}{lang === 'fr' ? ' :' : ':'}
					<span class="data"
						>{sky(lang, 'windValue', {
							speed: number(lang, aurora.wind.speed, 0),
							bz: number(lang, aurora.wind.bz)
						})}</span
					>
					<span class="muted small">({dateTime(lang, aurora.wind.measured)})</span>
				</p>
			{/if}
			{#if aurora.messages.length}
				<details>
					<summary>{sky(lang, 'messages')} ({aurora.messages.length})</summary>
					{#each aurora.messages as m (m.id)}
						<article class="message">
							<p class="muted small">{dateTime(lang, m.issued)}</p>
							<pre lang="en">{m.message}</pre>
						</article>
					{/each}
				</details>
			{/if}
		</section>
	{:else}
		<p class="note">{sky(lang, 'unavailable')}</p>
	{/if}

	<Credits {lang} credits={[aurora?.attribution, oval?.attribution, cell ? placeCredit : null]} />
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
	.pick {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.pick h2,
	.block h2 {
		margin: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.map {
		height: min(60vh, 460px);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.chart svg {
		width: 100%;
		height: auto;
	}
	.grid {
		stroke: currentColor;
		opacity: 0.15;
		stroke-width: 0.5;
	}
	.axis {
		font-size: 11px;
		fill: currentColor;
		opacity: 0.7;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
	}
	.message pre {
		white-space: pre-wrap;
		font-size: 13px;
		margin: 4px 0 12px;
	}
	.small {
		font-size: 13px;
	}
</style>
