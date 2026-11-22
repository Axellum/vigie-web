<script lang="ts">
	// The wind as an arrow that points where the wind goes (as on Meridien and on the map's badges), from the degrees it comes from.
	let {
		from,
		size = 20,
		colour = 'var(--wind)'
	}: { from: number; size?: number; colour?: string } = $props();
</script>

<svg class="arrow" width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true"
	><g transform="rotate({(from + 180) % 360})"
		><path d="M0 -1 L0.62 0.85 L0 0.42 L-0.62 0.85 Z" fill={colour} /></g
	></svg
>

<style>
	.arrow {
		flex: none;
		display: block;
	}
</style>
