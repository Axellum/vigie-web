<script lang="ts">
	// A triangle for a tide that rises, the same turned over for one that falls (the arrow characters are not in every television's fonts).
	let { trend }: { trend: 'rising' | 'falling' | null } = $props();
</script>

{#if trend}
	<svg class="tv-tri tv-tri-{trend}" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1L9.2 9H.8z" /></svg>
{/if}
