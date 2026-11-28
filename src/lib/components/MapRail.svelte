<script lang="ts" module>
	/** The drawing of a family's button. */
	export type RailIcon = 'spots' | 'weather' | 'wind' | 'rain' | 'alerts' | 'tide' | 'map';
	export interface RailFamily {
		id: string;
		icon: RailIcon;
		label: string;
		/** How many of its layers are shown; nothing is said at 0. */
		count: number;
		/** The same count said in words, for a screen reader. */
		countSaid: string;
		/** Coloured as shown: a family whose layers are on, or that is always there. */
		on: boolean;
	}
</script>

<script lang="ts">
	// The rail of the families of layers of a map, in its frame: a row over the map on a phone, a column on its left on a
	// computer; nothing of it over the map. A button opens its family's choices (`LayersPanel`), the same button folds them.
	let {
		label,
		families,
		open = $bindable(null),
		controls
	}: { label: string; families: RailFamily[]; open?: string | null; controls: string } = $props();
</script>

<div class="rail" role="group" aria-label={label}>
	{#each families as f (f.id)}
		<button
			type="button"
			class:on={f.on}
			aria-expanded={open === f.id}
			aria-controls={controls}
			onclick={() => (open = open === f.id ? null : f.id)}
			><svg viewBox="0 0 24 24" aria-hidden="true">
				{#if f.icon === 'spots'}
					<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" />
				{:else if f.icon === 'weather'}
					<circle cx="9" cy="9" r="3.2" /><path d="M9 2.6v1.4M3.6 9H2.2M4.5 4.5l1 1M13.5 4.5l-1 1" /><path
						d="M8.5 19.5a3.5 3.5 0 0 1 .3-7 4.8 4.8 0 0 1 9.2 1.2 2.9 2.9 0 0 1-.3 5.8z"
					/>
				{:else if f.icon === 'wind'}
					<path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h16a3 3 0 1 1-3 3" /><path d="M3 16h8" />
				{:else if f.icon === 'rain'}
					<path d="M7 15a4 4 0 0 1 .5-8A5.5 5.5 0 0 1 18 8.5 3.5 3.5 0 0 1 17.5 15z" /><path
						d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"
					/>
				{:else if f.icon === 'alerts'}
					<path d="M12 3.5L2.8 19.5h18.4z" /><path d="M12 10v4.5" /><path d="M12 17.2v.1" />
				{:else if f.icon === 'map'}
					<path d="M2.5 19.5L9 8l3.6 6.2L15 10.5l6.5 9z" /><path d="M7.4 10.8l1.6 1.4 1.5-1.3" />
				{:else}
					<path d="M2.5 9.5c2.4-2 4.7-2 7 0s4.7 2 7 0 4.2-1.6 5 0" /><path
						d="M2.5 15c2.4-2 4.7-2 7 0s4.7 2 7 0 4.2-1.6 5 0"
					/>
				{/if}
			</svg><span class="name">{f.label}</span>{#if f.count}<i class="count" aria-hidden="true">{f.count}</i
				><span class="visually-hidden">({f.countSaid})</span>{/if}</button
		>
	{/each}
</div>

<style>
	.rail {
		display: flex;
		gap: 6px;
		padding: 6px var(--gutter-r) 6px var(--gutter);
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		min-width: 0;
	}
	/* The drawing over the name, on a phone as on a computer: the families share the row of a phone in equal buttons. */
	.rail button {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 50px;
		padding: 4px 2px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--muted);
		font: 600 12px/1.1 var(--font-body);
		cursor: pointer;
	}
	@media (min-width: 900px) {
		.rail {
			flex: none;
			flex-direction: column;
			width: 76px;
			padding: 10px 8px;
			border-bottom: 0;
			border-right: 1px solid var(--line);
		}
		.rail button {
			flex: none;
			gap: 3px;
			min-height: 58px;
			padding: 6px 2px;
			font-size: 11.5px;
		}
	}
	.rail button svg {
		width: 22px;
		height: 22px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.rail .name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rail button.on {
		color: var(--accent);
	}
	/* How many layers of the family are shown, on the corner of its button. */
	.rail .count {
		position: absolute;
		top: 3px;
		right: 3px;
		min-width: 17px;
		height: 17px;
		padding: 0 4px;
		border-radius: 9px;
		background: var(--accent);
		color: var(--surface);
		font: 700 11px/17px var(--font-body);
		font-style: normal;
		text-align: center;
	}
	.rail button:hover,
	.rail button[aria-expanded='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	.rail button[aria-expanded='true'] {
		background: var(--accent-soft);
	}
</style>
