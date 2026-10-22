<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import ForecastDetails from '$lib/components/ForecastDetails.svelte';
	import HazardFacts from '$lib/components/HazardFacts.svelte';
	import LevelPill from '$lib/components/LevelPill.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import WarningBody from '$lib/components/WarningBody.svelte';
	import { grow, type Box } from '$lib/geo';
	import { tOr, translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const h = $derived(data.hazard);
	const frame = $derived<Box>(
		data.forecast?.bbox ? grow(data.forecast.bbox, 0.1) : [h.lon - 6, h.lat - 4, h.lon + 6, h.lat + 4]
	);
	const category = $derived(tOr(lang, `cat1.${h.category}`, h.category));
</script>

<Seo title={`${category} · ${h.title}`} description={`${category} · ${h.title}`} />

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/">{tr('nav.map')}</a> · {category}</p>
		<div><LevelPill {lang} level={h.level} /></div>
		<h1>{h.title}</h1>
	</header>
	<div class="layout">
		<article class="card body">
			<HazardFacts {lang} hazard={h} />
			{#if data.forecast}
				<ForecastDetails {lang} forecast={data.forecast} level={2} credited={h.attribution} />
			{:else if h.hasForecast}
				<p class="muted">{tr('fc.failed')}</p>
			{/if}
		</article>
		<div class="map">
			<MapView
				{lang}
				hazards={[h]}
				{frame}
				forecast={data.forecast?.features ?? null}
				selected={{ kind: 'hazard', id: h.id }}
			/>
		</div>
	</div>
	{#if data.messages.length}
		<section class="messages">
			<h2>{tr('fc.messages')}</h2>
			{#each data.messages as message (message.id)}
				<article class="card body">
					<WarningBody {lang} detail={message} />
				</article>
			{/each}
		</section>
	{/if}
	<p class="muted small">{tr('site.disclaimer')}</p>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.layout {
		display: grid;
		gap: 16px;
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.messages {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.map {
		height: 420px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
</style>
