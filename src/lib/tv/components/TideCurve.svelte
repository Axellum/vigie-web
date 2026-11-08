<script lang="ts">
	import type { TvCurve } from '../model.js';

	// Twenty-four hours of the tide, with a dot at each high and low water and a line where it is now. The marks are laid over
	// the drawing in percent, so that they stay round whatever the shape of the box (the drawing itself is stretched).
	let { curve }: { curve: TvCurve } = $props();
</script>

<div class="tv-curve">
	<svg class="tv-curve-svg" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
		<path class="tv-curve-area" d={curve.area} />
		<path class="tv-curve-line" d={curve.path} vector-effect="non-scaling-stroke" />
	</svg>
	{#each curve.extremes as e, i (i)}
		<span class="tv-curve-dot" style="left:{e.x}%;top:{e.y}%"></span>
	{/each}
	{#if curve.now}
		<span class="tv-curve-nowline" style="left:{curve.now.x}%"></span>
		<span class="tv-curve-nowdot" style="left:{curve.now.x}%;top:{curve.now.y}%"></span>
	{/if}
</div>
