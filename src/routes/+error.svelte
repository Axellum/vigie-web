<script lang="ts">
	import { page } from '$app/state';
	import { countryName, translator } from '#lib/i18n.js';

	const lang = $derived(page.data.lang ?? 'fr');
	const tr = $derived(translator(lang));
	// A warning that ended (410) points to its country, where the warnings in force are.
	const cc = $derived(page.status === 410 && page.params.cc ? page.params.cc.toLowerCase() : null);
</script>

<svelte:head>
	<title>Vigie · {page.status}</title>
</svelte:head>

<div class="page">
	<h1>
		{page.status === 404 ? tr('error.title') : page.status === 410 ? tr('error.gone') : tr('error.generic')}
	</h1>
	<p class="muted">{page.status === 502 ? tr('error.api') : (page.error?.message ?? '')}</p>
	<p>
		{#if cc}
			<a href="/country/{cc}">{countryName(lang, cc.toUpperCase())}</a> ·
		{/if}
		<a href="/">{tr('nav.map')}</a> · <a href="/countries">{tr('nav.countries')}</a>
	</p>
</div>
