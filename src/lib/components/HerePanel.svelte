<script lang="ts">
	// "Here" on the home map: the place chosen (the visitor's position or a place searched), what counts there in one
	// sentence, then the cards of "near me" in short (their summary only). It reads everything from the place's state
	// (`placeState.svelte.ts`), the same "near me" and "my page" use; the whole cards stay on "near me".
	import PlaceCard from '#lib/components/PlaceCard.svelte';
	import { translator } from '#lib/i18n.js';
	import { placeHash } from '#lib/near.js';
	import { placeFormat } from '#lib/placeFormat.js';
	import type { PlaceState } from '#lib/placeState.svelte.js';

	let {
		state: s,
		name,
		radiusKm,
		onback
	}: { state: PlaceState; name: string | null; radiusKm: number; onback: () => void } = $props();
	const tr = $derived(translator(s.lang));
	const { where } = $derived(placeFormat(s.lang));
</script>

{#if s.place}
	<section class="here" aria-labelledby="here-title">
		<p class="eyebrow">{tr('here.eyebrow')}</p>
		<h2 id="here-title">{name ?? where(s.place)}</h2>
		<p class="muted small">{tr('here.privacy')}</p>
		{#if s.sentence.length}
			<p class="said">{s.sentence.join(' ')}</p>
		{/if}
		<div class="cards" aria-label={tr('here.near')}>
			{#each s.order as card (card)}<PlaceCard state={s} name={card} size="s" />{/each}
		</div>
		<p class="links">
			<a href="/near{placeHash(s.place, radiusKm, null)}">{tr('here.all')}</a>
			<button type="button" class="btn quiet" onclick={onback}>{tr('here.back')}</button>
		</p>
	</section>
{/if}

<style>
	.here {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h2 {
		font: 700 26px/1.05 var(--font-display);
	}
	.said {
		font-weight: 600;
		line-height: 1.35;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	/* The cards of "near me" are made for a wide page: here they are a column of short lines. */
	.cards :global(.near-card) {
		gap: 6px;
		padding: 10px 12px;
	}
	.cards :global(.near-card h3) {
		font-size: 15px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
	}
</style>
