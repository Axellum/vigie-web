<script lang="ts">
	import type { Verdict } from '#lib/activities.js';

	// A verdict is a shape, a word and a colour, never the colour alone: a circle with a tick, a triangle, an octagon with a cross,
	// a dashed circle when there is none. The size is in rem (1 rem is 1/192 of the screen's width).
	let { verdict, size = 8 }: { verdict: Verdict | null; size?: number } = $props();
</script>

<svg
	class="tv-ico tv-v-{verdict ?? 'null'}"
	viewBox="0 0 48 48"
	style="width:{size}rem;height:{size}rem"
	aria-hidden="true"
>
	{#if verdict === 'good'}
		<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="5" />
		<path d="M13 25l8 8 15-17" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="square" />
	{:else if verdict === 'possible'}
		<path d="M24 4L45 41H3z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />
		<path d="M15 31q4.5-6 9 0t9 0" fill="none" stroke="currentColor" stroke-width="4.5" />
	{:else if verdict === 'poor'}
		<path
			d="M15 3h18l12 12v18L33 45H15L3 33V15z"
			fill="none"
			stroke="currentColor"
			stroke-width="5"
			stroke-linejoin="round"
		/>
		<path d="M16 16l16 16M32 16L16 32" stroke="currentColor" stroke-width="6" stroke-linecap="square" />
	{:else}
		<circle
			cx="24"
			cy="24"
			r="21"
			fill="none"
			stroke="currentColor"
			stroke-width="4"
			stroke-dasharray="6 5"
		/>
		<path d="M17 24h14" stroke="currentColor" stroke-width="5" />
	{/if}
</svg>
