<script lang="ts">
	// The tide of a position, with its credit ($lib/tideAt). Nothing is shown where the tide model has no point near (inland):
	// the tide is not a thing to report missing there. The position given is already rounded by the page.
	import { untrack } from 'svelte';
	import Credits from '#lib/components/Credits.svelte';
	import TideCurve from '#lib/components/TideCurve.svelte';
	import { translator, type Lang } from '#lib/i18n.js';
	import { TideAt } from '#lib/tideAt.svelte.js';

	let {
		lang,
		at,
		heading = 'h2'
	}: {
		lang: Lang;
		at: { lat: number; lon: number } | null;
		heading?: 'h2' | 'h3';
	} = $props();
	const tr = $derived(translator(lang));

	const tide = new TideAt();
	$effect(() => {
		const place = at;
		untrack(() => tide.follow(place));
	});
</script>

{#if at && tide.state && !tide.none}
	<section class="block tides">
		<svelte:element this={heading}>{tr('tide.title')}</svelte:element>
		{#if tide.value}
			<TideCurve {lang} curve={tide.value} now={tide.loadedAt} />
			<Credits {lang} credits={[tide.value.attribution]} />
		{:else if tide.state.status === 'error'}
			<p class="note">{tr('tide.failed')}</p>
		{:else}
			<p class="muted">{tr('tide.loading')}</p>
		{/if}
	</section>
{/if}

<style>
	.tides {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
</style>
