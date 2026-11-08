<script lang="ts">
	// The arrow shows where the wind goes (it comes from `deg`, in degrees from north), in a ring that marks the north up.
	let { deg, size = 12 }: { deg: number | null; size?: number } = $props();
</script>

<svg class="tv-arrow" viewBox="0 0 100 100" style="width:{size}rem;height:{size}rem" aria-hidden="true">
	<circle cx="50" cy="50" r="46" class="tv-arrow-ring" />
	{#if deg != null}
		<g transform="rotate({(deg + 180) % 360} 50 50)">
			<path d="M50 10l17 32H56v48H44V42H33z" class="tv-arrow-shape" />
		</g>
	{/if}
</svg>
