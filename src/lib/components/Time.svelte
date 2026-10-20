<script lang="ts">
	// A date in the reader's own time zone. The server does not know it: it writes UTC, and the browser
	// replaces it once the page is running.
	import { onMount } from 'svelte';
	import { dateTime, utc } from '$lib/format';
	import type { Lang } from '$lib/i18n';

	let { lang, unix }: { lang: Lang; unix: number | null } = $props();
	let local = $state(false);
	onMount(() => (local = true));
</script>

{#if unix == null}
	–
{:else}
	<time datetime={new Date(unix * 1000).toISOString()} title={utc(unix)}>
		{local ? dateTime(lang, unix) : utc(unix)}
	</time>
{/if}
