<script lang="ts">
	import { page } from '$app/state';

	// Title, description, canonical address and the basics of a social preview, in one place. The canonical
	// address has no query: the language (`?lang=`) and the filters never make another page.
	let {
		title,
		description = undefined
	}: {
		title: string;
		description?: string;
	} = $props();

	const full = $derived(`Vigie · ${title}`);
	const origin = $derived(page.data.origin as string);
	const url = $derived(`${origin}${page.url.pathname}`);
</script>

<svelte:head>
	<title>{full}</title>
	{#if description}<meta name="description" content={description} />{/if}
	<link rel="canonical" href={url} />
	<meta property="og:site_name" content="Vigie" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={full} />
	{#if description}<meta property="og:description" content={description} />{/if}
	<meta property="og:url" content={url} />
	<meta property="og:image" content="{origin}/icon-512.png" />
	<meta name="twitter:card" content="summary" />
</svelte:head>
