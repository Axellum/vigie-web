<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { countryName, translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const countries = $derived(
		data.served
			.map((c) => ({ cc: c.country, name: countryName(lang, c.country), verified: c.licenceVerified }))
			.sort((a, b) => a.name.localeCompare(b.name, lang))
	);
</script>

<Seo title={tr('countries.title')} description={tr('countries.intro')} />

<div class="page">
	<header class="intro">
		<h1>{tr('countries.title')}</h1>
		<p class="muted">{tr('countries.intro')}</p>
		{#if !data.apiDown}<p class="muted">{tr('countries.count', { n: countries.length })}</p>{/if}
	</header>
	{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	<ul class="grid">
		{#each countries as c (c.cc)}
			<li>
				<a href="/country/{c.cc.toLowerCase()}">
					<span class="code data">{c.cc}</span>
					<span>
						{c.name}
						{#if !c.verified}<span class="muted small licence">{tr('countries.licence')}</span>{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 70ch;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: 6px 16px;
	}
	.grid a {
		display: flex;
		gap: 10px;
		align-items: baseline;
		padding: 8px 10px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.grid a:hover {
		border-color: var(--accent);
	}
	.code {
		color: var(--muted);
		font-size: 12px;
	}
	.licence {
		display: block;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
</style>
