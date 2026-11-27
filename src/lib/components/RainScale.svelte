<script lang="ts">
	// The colour scale of a rain layer: a bar of its classes and the rates under four of them (the first, about each step of
	// the scale, the last with its unit), as on the home map. The classes are the API's; nothing is drawn without them.
	import { translator, type Lang } from '#lib/i18n.js';
	import { rate, type RadarClass } from '#lib/radar.js';

	let { lang, legend, testid }: { lang: Lang; legend: RadarClass[]; testid?: string } = $props();
	const tr = $derived(translator(lang));
	const n = $derived(legend.length);
	const marks = $derived(
		[0, 2, 5, n - 1]
			.filter((i, k, all) => i >= 0 && i < n && all.indexOf(i) === k)
			.map((i) => ({ i, text: rate(lang, legend[i].minMmH) }))
	);
</script>

{#if n}
	<div class="scale" data-testid={testid}>
		<div
			class="bar"
			role="img"
			aria-label="{tr('radar.legend')}: {legend.map((c) => `≥ ${rate(lang, c.minMmH)}`).join(', ')}"
		>
			{#each legend as c (c.minMmH)}<i style:background={c.color}></i>{/each}
		</div>
		<div class="marks" style:--n={n} aria-hidden="true">
			{#each marks as m (m.i)}
				<span
					class:last={m.i === n - 1}
					style:grid-column={m.i === n - 1 ? `${Math.max(1, m.i - 1)} / ${m.i + 2}` : m.i + 1}
					>{m.text}{m.i === n - 1 ? ` ${tr('radar.unit')}` : ''}</span
				>
			{/each}
		</div>
	</div>
{/if}

<style>
	.scale {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.bar {
		display: flex;
		height: 9px;
		border-radius: 5px;
		overflow: hidden;
		border: 1px solid var(--line);
	}
	.bar i {
		flex: 1;
	}
	.marks {
		display: grid;
		grid-template-columns: repeat(var(--n, 9), 1fr);
		font-size: 11px;
		color: var(--muted);
		line-height: 1.2;
	}
	.marks .last {
		text-align: right;
		white-space: nowrap;
	}
</style>
