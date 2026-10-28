<script lang="ts">
	// The credits the sources of a page ask for, folded under one line at the end of the page: always in the
	// page (their licences ask for them), as the API gives them, one click away.
	import { creditLines } from '#lib/credits.js';
	import { translator, type Lang } from '#lib/i18n.js';

	let { lang, credits }: { lang: Lang; credits: (string | null | undefined)[] } = $props();
	const tr = $derived(translator(lang));
	const lines = $derived(creditLines(credits));
</script>

{#if lines.length}
	<details class="credits">
		<summary>{tr('credits.summary')}</summary>
		{#each lines as line (line)}<p class="credit">{line}</p>{/each}
	</details>
{/if}

<style>
	.credits {
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	summary {
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		color: var(--muted);
	}
	summary:hover {
		color: var(--ink);
	}
	p {
		margin: 8px 0 0;
	}
</style>
