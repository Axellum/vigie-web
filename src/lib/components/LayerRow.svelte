<script lang="ts">
	// One layer in the frame of a map (the home map, the sea map): a box to tick, the name of the layer, and in a line under it
	// what it shows and where it comes from. A layer that cannot be turned off here (the wind on the labels of the kite) is ticked
	// and greyed.
	let {
		checked = $bindable(false),
		name,
		source,
		disabled = false,
		testid
	}: { checked?: boolean; name: string; source: string; disabled?: boolean; testid: string } = $props();
</script>

<label class="layer" class:disabled>
	<input type="checkbox" bind:checked {disabled} data-testid={testid} />
	<span><b>{name}</b><small>{source}</small></span>
</label>

<style>
	.layer {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 6px 0;
		cursor: pointer;
	}
	.layer.disabled {
		cursor: default;
	}
	.layer input {
		flex: none;
		width: 18px;
		height: 18px;
		margin: 2px 0 0;
		accent-color: var(--accent);
	}
	.layer span {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.layer b {
		font-size: 14px;
		line-height: 1.25;
	}
	.layer small {
		font-size: 12.5px;
		line-height: 1.3;
		color: var(--muted);
	}
</style>
