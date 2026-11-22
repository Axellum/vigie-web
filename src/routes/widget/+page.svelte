<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { pointCredits } from '#lib/credits.js';
	import { creditOf } from '#lib/tv/model.js';
	import PlaceView from '#lib/widget/components/PlaceView.svelte';
	import SpotView from '#lib/widget/components/SpotView.svelte';
	import { parseWidgetPlace } from '#lib/widget/params.js';
	import { PlaceWidget } from '#lib/widget/placeWidget.svelte.js';
	import { widgetText } from '#lib/widget/text.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
	const params = $derived(data.params);

	/** Every few minutes the page reads again: a widget stays open for days. */
	const REFRESH_MS = 10 * 60 * 1000;

	// The place is read from the `#` in the browser only: until then (and on the server) the page draws no place.
	let mounted = $state(false);
	let hash = $state('');
	let now = $state(Math.floor(Date.now() / 1000));
	const place = $derived(mounted ? parseWidgetPlace(hash) : null);
	const widget = new PlaceWidget(() => ({
		place: place ? { lat: place.lat, lon: place.lon } : null,
		served: data.served
	}));
	const spot = $derived(data.spot.status === 'ok' ? data.spot.screen : null);
	const name = $derived(place ? (place.name ?? `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`) : '');
	const credit = $derived(
		creditOf([
			...widget.officialCredits,
			...(widget.w ? pointCredits(widget.w) : []),
			widget.wind?.value?.points.length ? widget.wind.value.attribution : null,
			...(spot && (params.size === 'large' || !place) ? [spot.credit] : [])
		])
	);

	let last = Date.now();
	function refresh() {
		last = Date.now();
		now = Math.floor(last / 1000);
		widget.refresh();
		if (data.params.spot) void invalidateAll();
	}

	onMount(() => {
		hash = location.hash;
		mounted = true;
		const onHash = () => (hash = location.hash);
		const onVisible = () => {
			if (document.visibilityState === 'visible' && Date.now() - last > REFRESH_MS / 2) refresh();
		};
		addEventListener('hashchange', onHash);
		document.addEventListener('visibilitychange', onVisible);
		const tick = setInterval(() => (now = Math.floor(Date.now() / 1000)), 60_000);
		const reread = setInterval(refresh, REFRESH_MS);
		return () => {
			removeEventListener('hashchange', onHash);
			document.removeEventListener('visibilitychange', onVisible);
			clearInterval(tick);
			clearInterval(reread);
		};
	});
</script>

<svelte:head>
	<title>{widgetText(lang, 'title')}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div
	class="widget {params.theme} {params.size}"
	title={credit || undefined}
	data-ready={mounted ? 'yes' : 'no'}
>
	{#if !mounted}
		<!-- The place is read in the browser. -->
	{:else if place}
		<PlaceView {widget} {name} size={params.size} theme={params.theme} {lang} {now} {spot} />
	{:else if spot}
		<SpotView screen={spot} size={params.size} {lang} />
	{:else if data.spot.status === 'unknown' || data.spot.status === 'unavailable'}
		<div class="empty">
			<b>{widgetText(lang, data.spot.status === 'unknown' ? 'spotUnknown' : 'spotUnavailable')}</b>
		</div>
	{:else}
		<div class="empty">
			<b>{widgetText(lang, 'noPlace')}</b>
			<span class="t3">{widgetText(lang, 'noPlaceHint')}</span>
		</div>
	{/if}
	{#if mounted && params.size === 'large' && credit}
		<div class="credit t3">{credit}</div>
	{/if}
</div>

<style>
	/* The themes of the family's common charter (drawn from Meridien): sky, plain dark, light. */
	.widget {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 14px;
		overflow: hidden;
		font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
		font-weight: 600;
		line-height: 1.15;
		color: var(--t);
		-webkit-font-smoothing: antialiased;
	}
	.widget.small {
		gap: 4px;
		padding: 9px 14px 10px;
		justify-content: center;
	}
	.widget.large {
		gap: 7px;
		padding: 10px 14px 6px;
	}
	.sky {
		background: linear-gradient(#1f4477, #305783);
		--card: rgba(10, 18, 32, 0.44);
		--edge: rgba(255, 255, 255, 0.08);
		--t: #f6f8fb;
		--t2: #d3dce6;
		--t3: #b4c2d2;
		--line: #5e738c;
		--accent: #ffc857;
		--on: #10151c;
		--yellow: #ffd25c;
		--orange: #ffa24d;
		--red: #ff9a90;
		--good: #7fe0a8;
		--possible: #ffd25c;
		--poor: #ff9a90;
		--wind: #8fd6ff;
		--rain: #5cb8ff;
		--rain-light: #8fd6ff;
		--rain-heavy: #3a8cf0;
	}
	.dark {
		background: #0c1117;
		--card: #19232e;
		--edge: transparent;
		--t: #f4f7fa;
		--t2: #cbd5df;
		--t3: #a3b1c0;
		--line: #2c3947;
		--accent: #3ddc97;
		--on: #10151c;
		--yellow: #ffd25c;
		--orange: #ffa24d;
		--red: #ff6b5e;
		--good: #6fe3b0;
		--possible: #ffd25c;
		--poor: #ff6b5e;
		--wind: #7fd1ff;
		--rain: #58b4ff;
		--rain-light: #8fd6ff;
		--rain-heavy: #3a8cf0;
	}
	.light {
		background: #eef1f4;
		--card: #ffffff;
		--edge: #d5dbe2;
		--t: #12171c;
		--t2: #37424e;
		--t3: #4f5c6a;
		--line: #d5dbe2;
		--accent: #0e8f5f;
		--on: #ffffff;
		--yellow: #8a6400;
		--orange: #b45309;
		--red: #c22f2f;
		--good: #1b8a5a;
		--possible: #8a6400;
		--poor: #c22f2f;
		--wind: #0f78b0;
		--rain: #1e78d6;
		--rain-light: #5ea6e8;
		--rain-heavy: #1458a8;
	}
	.widget :global(.t2) {
		color: var(--t2);
	}
	.widget :global(.t3) {
		color: var(--t3);
	}
	.widget :global(.card) {
		background: var(--card);
		border: 1.5px solid var(--edge);
		border-radius: 12px;
	}
	.empty {
		margin: auto;
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: center;
		font-size: 16px;
	}
	.empty span {
		font-size: 13px;
	}
	.credit {
		margin-top: auto;
		font-size: 11px;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
