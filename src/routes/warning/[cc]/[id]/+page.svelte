<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import type { FeatureCollection } from 'geojson';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import WarningBody from '#lib/components/WarningBody.svelte';
	import { geometryBox } from '#lib/geo.js';
	import { countryName, tOr, translator } from '#lib/i18n.js';
	import { warningTitle } from '#lib/rows.js';
	import { slug } from '#lib/transform.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const d = $derived(data.detail);
	const name = $derived(countryName(lang, d.cc));
	const title = $derived(warningTitle({ ...d, texts: d.texts }, lang));
	const zones = $derived<FeatureCollection>({
		type: 'FeatureCollection',
		features: d.geometry
			? [{ type: 'Feature', geometry: d.geometry, properties: { key: d.id, level: d.level ?? 'NONE' } }]
			: []
	});
	const frame = $derived(d.geometry ? geometryBox(d.geometry) : null);
</script>

<Seo title={`${title}${d.area ? ` · ${d.area}` : ''}`} description={`${title} · ${d.area ?? ''} · ${name}`} />

<div class="page">
	<header class="intro">
		<p class="eyebrow">
			<a href="/country/{d.cc.toLowerCase()}">{name}</a>
			{#if d.area}· <a href="/country/{d.cc.toLowerCase()}/{slug(d.area)}">{d.area}</a>{/if}
		</p>
		<div class="title">
			<LevelPill {lang} level={d.level} />
			{#if d.phenomenon}<span class="muted small">{tOr(lang, `phen.${d.phenomenon}`, d.phenomenon)}</span
				>{/if}
		</div>
		<h1>{title}</h1>
	</header>
	<div class="layout">
		<article class="card body">
			<WarningBody {lang} detail={d} />
		</article>
		{#if d.geometry}
			<div class="map">
				<MapView {lang} {zones} {frame} selected={{ kind: 'zone', key: d.id }} />
			</div>
		{/if}
	</div>
	<p class="muted small">{tr('site.disclaimer')}</p>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 10px;
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
