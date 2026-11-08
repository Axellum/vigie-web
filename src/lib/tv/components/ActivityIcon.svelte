<script lang="ts">
	import type { ActivityId } from '#lib/activities.js';

	let { id, size = 7 }: { id: ActivityId; size?: number } = $props();
</script>

<svg class="tv-act-ico" viewBox="0 0 48 48" style="width:{size}rem;height:{size}rem" aria-hidden="true">
	{#if id === 'surf'}
		<path d="M3 34q6-14 14-14 7 0 8 7 1-9 10-15-1 9 5 15 4 4 5 7H3z" fill="currentColor" />
	{:else if id === 'kite'}
		<path d="M26 4l15 14-15 14L11 18z" fill="currentColor" />
		<path d="M26 32q-4 8 2 14" fill="none" stroke="currentColor" stroke-width="3" />
	{:else if id === 'boat'}
		<path d="M24 5v27H8z" fill="currentColor" />
		<path d="M27 12l14 20H27z" fill="currentColor" opacity=".6" />
		<path d="M5 37h38l-6 7H11z" fill="currentColor" />
	{:else}
		<path d="M9 18h30l-4 24H13z" fill="currentColor" />
		<path d="M14 18q10-20 20 0" fill="none" stroke="currentColor" stroke-width="3.5" />
	{/if}
</svg>
