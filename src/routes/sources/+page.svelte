<script lang="ts">
	import { translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
</script>

<svelte:head>
	<title>Vigie · {tr('sources.title')}</title>
	<meta name="description" content={tr('sources.intro')} />
</svelte:head>

<div class="page">
	<header class="intro">
		<h1>{tr('sources.title')}</h1>
		<p class="muted">{tr('sources.intro')}</p>
	</header>

	<section class="block">
		<h2>{tr('sources.state')}</h2>
		{#if data.providers}
			<ul class="providers">
				{#each data.providers as p (p.name)}
					<li>
						<span
							class="dot sev-{p.healthy === true ? 'GREEN' : p.healthy === false ? 'RED' : 'NONE'}"
							aria-hidden="true"
						></span>
						<span class="name">{p.name}</span>
						<span class="muted small"
							>{p.healthy === true
								? tr('sources.healthy')
								: p.healthy === false
									? tr('sources.unhealthy')
									: '–'}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{tr('sources.unavailable')}</p>
		{/if}
	</section>

	<section class="block">
		<h2>{tr('sources.credits')}</h2>
		{#each data.credits as c (c)}<p class="credit">{c}</p>{/each}
		<p class="credit">{tr('detail.gdacs')}</p>
		<p class="credit">{tr('detail.derived')}</p>
	</section>

	<section class="block">
		<h2>{tr('sources.basemap')}</h2>
		<p class="credit">{tr('map.credit')}</p>
		<h2>{tr('sources.places')}</h2>
		<p class="credit">{tr('sources.placesCredit')}</p>
	</section>
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 70ch;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.providers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
		gap: 6px 16px;
	}
	.providers li {
		display: grid;
		grid-template-columns: 12px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.name {
		overflow-wrap: anywhere;
	}
</style>
