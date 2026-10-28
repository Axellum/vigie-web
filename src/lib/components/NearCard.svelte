<script lang="ts">
	// One card of a place: a title, what it says in a few words, and its detail folded under one line.
	import type { Snippet } from 'svelte';

	let {
		title,
		badge,
		summary,
		details,
		detailsLabel,
		open = false
	}: {
		title: string;
		badge?: Snippet;
		summary: Snippet;
		details?: Snippet;
		detailsLabel: string;
		open?: boolean;
	} = $props();
</script>

<section class="card near-card" aria-label={title}>
	<header>
		<h3>{title}</h3>
		{#if badge}{@render badge()}{/if}
	</header>
	{@render summary()}
	{#if details}
		<details {open}>
			<summary>{detailsLabel}</summary>
			<div class="inner">{@render details()}</div>
		</details>
	{/if}
</section>

<style>
	.near-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}
	h3 {
		font-size: 18px;
	}
	details {
		border-top: 1px solid var(--line);
		padding-top: 8px;
		margin-top: auto;
	}
	summary {
		cursor: pointer;
		font-size: 13.5px;
		color: var(--accent);
	}
	.inner {
		padding-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
</style>
