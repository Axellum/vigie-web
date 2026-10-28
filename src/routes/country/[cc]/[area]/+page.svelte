<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import CountryWarnings from '#lib/components/CountryWarnings.svelte';
	import { countryName, translator } from '#lib/i18n.js';
	import { byLevelThenTime } from '#lib/levels.js';
	import { warningRow } from '#lib/rows.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const name = $derived(countryName(lang, data.cc));
	const rows = $derived(data.warnings.map(warningRow).sort(byLevelThenTime));
</script>

<Seo
	title={tr('area.title', { area: data.area, country: name })}
	description={rows.length
		? tr('area.description', { area: data.area, country: name, n: rows.length })
		: tr('area.title', { area: data.area, country: name })}
	noindex={rows.length === 0}
/>

<div class="page">
	<header class="intro">
		<p class="eyebrow">
			<a href="/countries">{tr('nav.countries')}</a> · <a href="/country/{data.cc.toLowerCase()}">{name}</a>
		</p>
		<h1>{tr('area.title', { area: data.area, country: name })}</h1>
		{#if data.accounts}
			<p class="small">
				<a href="/account/zones/new?country={data.cc}&area={encodeURIComponent(data.area)}" rel="nofollow"
					>{tr('zones.watchArea')}</a
				>
			</p>
		{/if}
	</header>
	{#if rows.length === 0}
		<p>{tr('country.none')}</p>
	{:else}
		<CountryWarnings {lang} cc={data.cc} warnings={data.warnings} frame={data.box} now={data.now} />
		<div class="list">
			{#each rows as row (row.key)}
				<AlertRow {lang} {row} now={data.now} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
</style>
