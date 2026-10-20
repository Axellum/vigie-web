<script lang="ts">
	import { COVERED_CODES } from '$lib/geo';
	import { countryName, translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const countries = $derived(
		COVERED_CODES.map((cc) => ({ cc, name: countryName(lang, cc) })).sort((a, b) =>
			a.name.localeCompare(b.name, lang)
		)
	);
</script>

<svelte:head>
	<title>Vigie · {tr('countries.title')}</title>
	<meta name="description" content={tr('countries.intro')} />
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>{tr('countries.title')}</h1>
		<p class="muted">{tr('countries.intro')}</p>
	</header>
	<ul class="grid">
		{#each countries as c (c.cc)}
			<li><a href="/country/{c.cc.toLowerCase()}"><span class="code data">{c.cc}</span> {c.name}</a></li>
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
</style>
