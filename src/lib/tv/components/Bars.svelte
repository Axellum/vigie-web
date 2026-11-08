<script lang="ts">
	import type { TvBar } from '../model.js';

	// An hour per bar, from now: its height says the value, a line over it the gust, the hour under every few bars. A night hour is
	// drawn in the muted colour.
	let { bars }: { bars: TvBar[] } = $props();
</script>

<div class="tv-bars">
	{#each bars as bar, i (i)}
		<div class="tv-bar">
			<div class="tv-bar-col">
				<div class="tv-bar-fill{bar.night ? ' tv-bar-night' : ''}" style="height:{bar.pct}%"></div>
				{#if bar.gustPct != null}<div class="tv-bar-gust" style="bottom:{bar.gustPct}%"></div>{/if}
			</div>
			<div class="tv-bar-label">{bar.label ?? ''}</div>
		</div>
	{/each}
</div>
