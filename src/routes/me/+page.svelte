<script lang="ts">
	// "My page": the places of the account and the cards chosen for them (src/lib/components/MyPageView.svelte). The
	// page is private; the places and the blocks are read here and the weather, the warnings and the tide are
	// loaded by the browser as on "near me".
	import MyPageView from '#lib/components/MyPageView.svelte';
	import MyLinks from '#lib/components/MyLinks.svelte';
	import MySettings from '#lib/components/MySettings.svelte';
	import { translator } from '#lib/i18n.js';

	let { data, form } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	// A place added, moved or removed makes a new view, with a new state for each place.
	const signature = $derived(
		data.places.map((p) => `${p.id}:${p.lat},${p.lon},${p.radiusKm},${p.profile}`).join('|')
	);
</script>

<svelte:head>
	<title>Vigie · {data.page.title}</title>
	<meta name="description" content={tr('me.description')} />
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page me">
	<header class="intro">
		<p class="eyebrow">{data.user.name}</p>
		<h1>{data.page.title}</h1>
		<p class="muted small">{tr('me.private')}</p>
		{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	</header>

	{#key signature}
		<MyPageView
			{lang}
			places={data.places}
			blocks={data.page.blocks}
			hazards={data.hazards}
			hazardsAttribution={data.hazardsAttribution}
			served={data.served}
			uncovered={data.uncovered}
			pageId={data.page.id}
			title={data.page.title}
			now={data.now}
			selected={data.selected}
			units={data.units}
		/>
	{/key}

	<MyLinks
		{lang}
		pageId={data.page.id}
		blocks={data.page.blocks}
		links={data.links}
		maxLinks={data.maxLinks}
		tvCards={data.tvCards}
		made={form?.madeLink ?? null}
		error={form?.linkError ?? null}
	/>

	<MySettings {lang} units={data.units} />
</div>

<style>
	/* Wider than the reading pages: the cards side by side. */
	.page.me {
		max-width: 1240px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
