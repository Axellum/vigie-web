<script lang="ts">
	import type { TvActivity } from '../model.js';

	// The next 24 hours of an activity, an hour per cell: a shape and a tint, a dashed outline at night, the hour now marked by a
	// bar. The hours under it are its start, its middle and its end.
	let { activity, marks = true }: { activity: TvActivity; marks?: boolean } = $props();
</script>

<div class="tv-strip">
	{#each activity.cells as cell, i (i)}
		<div class="tv-cell tv-v-{cell.verdict ?? 'null'}{cell.night ? ' tv-cell-night' : ''}">
			{#if cell.now}<span class="tv-cell-now"></span>{/if}
			<span class="tv-cell-mark tv-cell-mark-{cell.verdict ?? 'null'}"></span>
		</div>
	{/each}
</div>
{#if marks && activity.marks.length}
	<div class="tv-strip-marks">
		{#each activity.marks as mark, i (i)}<span>{mark}</span>{/each}
	</div>
{/if}
