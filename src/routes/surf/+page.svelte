<script lang="ts">
	// The surf spots of the API, north to south, each with the direction its beach faces; a spot opens its forecast.
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { compass, surfText } from '#lib/surf.js';

	let { data } = $props();
	const lang = $derived(data.lang);
</script>

<Seo title={surfText(lang, 'page')} description={surfText(lang, 'pageIntro')} />

<div class="page">
	<header class="intro">
		<h1>{surfText(lang, 'page')}</h1>
		<p class="muted">{surfText(lang, 'pageIntro')}</p>
		<p class="note">{surfText(lang, 'safety')}</p>
	</header>

	{#if data.spots?.spots.length}
		<section class="block">
			<h2>{surfText(lang, 'spots')}</h2>
			<ul class="spots">
				{#each data.spots.spots as s (s.id)}
					<li>
						<a href="/surf/{s.id}">
							<strong>{s.name}</strong>
							{#if s.place}<span>{s.place}</span>{/if}
							<span class="muted small"
								>{surfText(lang, 'facing', { dir: compass(lang, s.facing), deg: s.facing })}</span
							>
						</a>
					</li>
				{/each}
			</ul>
			<p class="muted small">{surfText(lang, 'spotsNote')}</p>
		</section>
	{:else}
		<p class="note">{surfText(lang, 'unavailable')}</p>
	{/if}

	<Credits {lang} credits={[data.spots?.attribution]} />
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
	.block h2 {
		margin: 0 0 8px;
	}
	.spots {
		list-style: none;
		padding: 0;
		margin: 0 0 8px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}
	.spots a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
	}
	.spots a:hover {
		border-color: var(--accent);
	}
</style>
