<script lang="ts">
	import HazardFacts from '$lib/components/HazardFacts.svelte';
	import LevelPill from '$lib/components/LevelPill.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import type { Box } from '$lib/geo';
	import { tOr, translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const h = $derived(data.hazard);
	const frame = $derived<Box>([h.lon - 6, h.lat - 4, h.lon + 6, h.lat + 4]);
	const category = $derived(tOr(lang, `cat1.${h.category}`, h.category));
</script>

<svelte:head>
	<title>Vigie · {category} · {h.title}</title>
	<meta name="description" content="{category} · {h.title}" />
</svelte:head>

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/">{tr('nav.map')}</a> · {category}</p>
		<div><LevelPill {lang} level={h.level} /></div>
		<h1>{h.title}</h1>
	</header>
	<div class="layout">
		<article class="card body">
			<HazardFacts {lang} hazard={h} />
		</article>
		<div class="map">
			<MapView {lang} hazards={[h]} {frame} selected={{ kind: 'hazard', id: h.id }} />
		</div>
	</div>
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
	.map {
		height: 420px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
</style>
