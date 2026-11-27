<script lang="ts">
	// The choices of one family of layers, over the map beside its rail (`MapRail`): a title, a button that folds it, and what
	// the page puts in it (its layers, `LayerRow`, their legends and notes).
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		closeLabel,
		onclose,
		children
	}: { id: string; title: string; closeLabel: string; onclose: () => void; children: Snippet } = $props();
</script>

<section class="layers" {id} aria-label={title}>
	<header>
		<h2>{title}</h2>
		<button type="button" class="x" aria-label={closeLabel} onclick={onclose}>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
		</button>
	</header>
	{@render children()}
</section>

<style>
	.layers {
		position: absolute;
		left: 10px;
		top: 10px;
		z-index: 5;
		width: min(310px, calc(100% - 64px));
		max-height: calc(100% - 20px);
		overflow-y: auto;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	h2 {
		margin: 0;
		font-size: 17px;
	}
	.layers :global(p) {
		margin: 0;
	}
	.layers :global(.chips) {
		margin: 2px 0;
	}
	.x {
		flex: none;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.x svg {
		width: 12px;
		height: 12px;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
</style>
