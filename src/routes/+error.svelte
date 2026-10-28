<script lang="ts">
	import { page } from '$app/state';
	import { translator } from '#lib/i18n.js';

	const tr = $derived(translator(page.data.lang ?? 'fr'));
</script>

<svelte:head>
	<title>Vigie · {page.status}</title>
</svelte:head>

<div class="page">
	<h1>{page.status === 404 ? tr('error.title') : tr('error.generic')}</h1>
	<p class="muted">{page.status === 502 ? tr('error.api') : (page.error?.message ?? '')}</p>
	<p><a href="/">{tr('nav.map')}</a> · <a href="/countries">{tr('nav.countries')}</a></p>
</div>
