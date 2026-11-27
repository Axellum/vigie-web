<script lang="ts">
	import { onMount } from 'svelte';
	import { pointCredits } from '#lib/credits.js';
	import { snapToGrid } from '#lib/near.js';
	import { creditOf } from '#lib/tv/model.js';
	import HomeCard from '#lib/widget/components/HomeCard.svelte';
	import PlaceView from '#lib/widget/components/PlaceView.svelte';
	import SpotView from '#lib/widget/components/SpotView.svelte';
	import { fit } from '#lib/widget/fit.js';
	import { cardData, cardWarnings, type CardAnswer } from '#lib/widget/homeCard.js';
	import { rainView, vigilanceView } from '#lib/widget/model.js';
	import { boardSize, parseWidgetPlace } from '#lib/widget/params.js';
	import { labelOf, postToHost, widgetSummary } from '#lib/widget/summary.js';
	import { PlaceWidget } from '#lib/widget/placeWidget.svelte.js';
	import { widgetText } from '#lib/widget/text.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
	const params = $derived(data.params);
	// In the widgets board the layout follows the height Windows gives, not the size it was asked (params.ts).
	let height = $state(0);
	const size = $derived(params.board && height > 0 ? boardSize(height) : params.size);

	/** Every few minutes the page reads again: a widget stays open for days. */
	const REFRESH_MS = 10 * 60 * 1000;

	// The place is read from the `#` in the browser only: until then (and on the server) the page draws no place.
	let mounted = $state(false);
	let hash = $state('');
	let now = $state(Math.floor(Date.now() / 1000));
	const place = $derived(mounted ? parseWidgetPlace(hash) : null);
	const home = $derived(params.face === 'home');
	// The home face reads the whole answer of the API first (`/data/card.json`): the site keeps its own reading of it too, so
	// that the weather the widget reads next for its summary costs the API nothing more.
	let answer = $state<{ key: string; status: 'loading' | 'ok' | 'error'; value?: CardAnswer } | null>(null);
	const cell = $derived(place ? snapToGrid(place) : null);
	const cellKey = $derived(cell ? `${cell.lat},${cell.lon}` : null);
	const answered = $derived(answer != null && answer.key === cellKey && answer.status !== 'loading');
	const widget = new PlaceWidget(() => ({
		place: place && (!home || answered) ? { lat: place.lat, lon: place.lon } : null,
		served: data.served
	}));
	// The spot as the server drew it, or as the browser read it after: when the server did not have it in time (`pending`), and
	// every few minutes.
	type SpotData = PageProps['data']['spot'];
	let read = $state<{ id: string; value: SpotData } | null>(null);
	const spotData = $derived(read && read.id === params.spot ? read.value : data.spot);
	const spot = $derived(spotData.status === 'ok' ? spotData.screen : null);
	const name = $derived(place ? (place.name ?? `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`) : '');
	const credit = $derived(
		creditOf([
			...widget.officialCredits,
			...(widget.w ? pointCredits(widget.w) : []),
			widget.wind?.value?.points.length ? widget.wind.value.attribution : null,
			...(spot && (size === 'large' || !place) ? [spot.credit] : [])
		])
	);

	// The desktop app that shows the page reads its icon and its notifications from this.
	const summary = $derived(
		widgetSummary({
			lang,
			now,
			name: place ? name : null,
			vigilance: place ? vigilanceView(widget.official, widget.here, labelOf(lang), now) : null,
			rain: place ? rainView(widget.w, now) : null,
			weatherLoading: place != null && (widget.weather == null || widget.weather.status === 'loading'),
			tempC: widget.w?.current?.tempC ?? null,
			spot,
			spotLoading: spotData.status === 'pending'
		})
	);
	$effect(() => {
		if (mounted) postToHost(summary);
	});

	/** Reads the whole answer of the cell for the card. A new reading keeps the last good one until it comes. */
	async function loadAnswer(again = false) {
		const at = cell,
			key = cellKey;
		if (!at || !key) return;
		const kept = again && answer?.key === key && answer.value ? answer : null;
		if (!kept) answer = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/card.json?lat=${at.lat}&lon=${at.lon}`);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as CardAnswer;
			if (cellKey === key) answer = { key, status: 'ok', value };
		} catch {
			if (cellKey === key && !kept) answer = { key, status: 'error' };
		}
	}
	$effect(() => {
		if (home && cellKey && answer?.key !== cellKey) void loadAnswer();
	});
	// The card is put on the page once its data are there: the answer, and the warnings matched against the place (or after a
	// few seconds without them, when a country's warnings do not come).
	let waited = $state(false);
	$effect(() => {
		if (!home || !answered) return;
		const timer = setTimeout(() => (waited = true), 4000);
		return () => clearTimeout(timer);
	});
	const cardReady = $derived(home && answered && (widget.official !== 'loading' || waited));
	const card = $derived(
		place && answer?.status === 'ok' && answer.value
			? cardData({
					name,
					lang,
					answer: answer.value,
					warnings:
						widget.official === 'loading'
							? null
							: cardWarnings(
									widget.official,
									widget.here,
									lang,
									now,
									widget.officialCredits.join(' · ') || null
								)
				})
			: null
	);

	/** Reads the spot again. The spot on screen stays there while the new reading comes, and if it does not come. */
	async function loadSpot() {
		const id = params.spot;
		if (!id) return;
		try {
			const response = await fetch(
				`/data/widget-spot.json?spot=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`
			);
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as SpotData;
			if (value.status === 'ok' || spotData.status !== 'ok') read = { id, value };
		} catch {
			if (spotData.status === 'pending') read = { id, value: { status: 'unavailable', screen: null } };
		}
	}

	let last = Date.now();
	async function refresh() {
		last = Date.now();
		now = Math.floor(last / 1000);
		if (home) await loadAnswer(true);
		widget.refresh();
		void loadSpot();
	}

	onMount(() => {
		hash = location.hash;
		mounted = true;
		if (spotData.status === 'pending') void loadSpot();
		const onHash = () => (hash = location.hash);
		const onVisible = () => {
			if (document.visibilityState === 'visible' && Date.now() - last > REFRESH_MS / 2) void refresh();
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

<svelte:window bind:innerHeight={height} />

<svelte:head>
	<title>{widgetText(lang, 'title')}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

{#if home}
	<!-- The home and Details pages of the Home Assistant card, at its size; the summary for the desktop app is the widget's. No
	     tooltip of credits: it covered the card in the flyout, and the card names its sources at the foot of its Details page. -->
	<div class="home" data-ready={mounted && (cardReady || !place) ? 'yes' : 'no'}>
		{#if !mounted}
			<!-- The place is read in the browser. -->
		{:else if place}
			{#if cardReady}
				<HomeCard {name} {lang} dark={params.theme !== 'light'} data={card} />
			{/if}
		{:else}
			<div class="empty {params.theme}">
				<b>{widgetText(lang, 'noPlace')}</b>
				<span class="t3">{widgetText(lang, 'noPlaceHint')}</span>
			</div>
		{/if}
	</div>
{:else}
	<div
		class="widget {params.theme} {size}"
		class:board={params.board}
		use:fit
		title={credit || undefined}
		data-ready={mounted ? 'yes' : 'no'}
	>
		{#if !mounted}
			<!-- The place is read in the browser. -->
		{:else if place}
			<PlaceView {widget} {name} {size} theme={params.theme} {lang} {now} {spot} />
		{:else if spot}
			<SpotView screen={spot} {size} {lang} />
		{:else if spotData.status === 'pending'}
			<div class="empty"><span class="t3">{widgetText(lang, 'spotLoading')}</span></div>
		{:else if spotData.status === 'unknown' || spotData.status === 'unavailable'}
			<div class="empty">
				<b>{widgetText(lang, spotData.status === 'unknown' ? 'spotUnknown' : 'spotUnavailable')}</b>
			</div>
		{:else}
			<div class="empty">
				<b>{widgetText(lang, 'noPlace')}</b>
				<span class="t3">{widgetText(lang, 'noPlaceHint')}</span>
			</div>
		{/if}
		{#if mounted && size === 'large' && credit}
			<div class="credit t3">{credit}</div>
		{/if}
	</div>
{/if}

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
	/* The widgets board of Windows writes the widget's name over the top 48 pixels of the page. */
	.widget.board {
		padding-top: 48px;
	}
	/* A part hidden because the host gives less height than the size says (fit.ts). */
	.widget :global([data-dropped]) {
		display: none !important;
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
	/* The home face: the card fills the page, on its own background (HomeCard.svelte). */
	.home {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
	.home .empty {
		position: absolute;
		inset: 0;
		justify-content: center;
		font-family: 'Barlow Semi Condensed', 'Arial Narrow', sans-serif;
		font-weight: 600;
		color: var(--t);
	}
	.home .empty .t3 {
		color: var(--t3);
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
