<script lang="ts">
	// The card of the measured wind over the map, while the layer is on: the time of the newest observation, the unit (km/h or
	// knots), the legend of the colours, and a button that turns the layer off. The badges are drawn by the map (MapView), the
	// state is the page's (WindLayer). Kept at the top left: the rain radar's card holds the bottom left.
	import { translator, type Lang } from '#lib/i18n.js';
	import { WIND_STEPS, windTime, windValue } from '#lib/wind.js';
	import type { WindLayer } from '#lib/windLayer.svelte.js';

	let { lang, wind }: { lang: Lang; wind: WindLayer } = $props();
	const tr = $derived(translator(lang));

	const data = $derived(wind.data);
	const unitText = $derived(tr(wind.unit === 'kn' ? 'wind.kn' : 'wind.kmh'));
	const marks = $derived(WIND_STEPS.map((kmh) => windValue(kmh, wind.unit)));
	const legendText = $derived(
		`${tr('wind.legend')} (${unitText}): < ${marks[0]}, ${marks
			.slice(0, -1)
			.map((m, i) => `${m}-${marks[i + 1]}`)
			.join(', ')}, ≥ ${marks.at(-1)}`
	);
</script>

{#if wind.on}
	<section class="card" aria-label={tr('wind.title')} data-testid="wind-card">
		<div class="head">
			<h2 class="eyebrow">
				{data?.measured ? tr('wind.at', { time: windTime(lang, data.measured) }) : tr('wind.title')}
			</h2>
			<button type="button" class="close" onclick={() => (wind.on = false)} aria-label={tr('wind.hide')}>
				<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
					><path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
					/></svg
				>
			</button>
		</div>
		<div class="units" role="group" aria-label={tr('wind.unit')}>
			<button type="button" aria-pressed={wind.unit === 'kmh'} onclick={() => (wind.unit = 'kmh')}
				>{tr('wind.kmh')}</button
			>
			<button type="button" aria-pressed={wind.unit === 'kn'} onclick={() => (wind.unit = 'kn')}
				>{tr('wind.kn')}</button
			>
		</div>
		<div class="bar" role="img" aria-label={legendText}>
			{#each [1, 2, 3, 4, 5] as step (step)}<i style:background={`var(--wind-${step})`}></i>{/each}
		</div>
		<div class="marks" aria-hidden="true">
			{#each marks as m (m)}<span>{m}</span>{/each}
		</div>
		{#if wind.status === 'failed' && !data}
			<p class="note">{tr('wind.failed')}</p>
		{:else if !data}
			<p class="note">{tr('wind.loading')}</p>
		{:else if data.points.length === 0}
			<p class="note">{tr('wind.empty')}</p>
		{/if}
	</section>
{/if}

<style>
	.card {
		position: absolute;
		left: 10px;
		top: 10px;
		z-index: 3;
		width: min(220px, calc(100% - 70px));
		box-sizing: border-box;
		padding: 7px 10px 8px;
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.head .eyebrow {
		margin: 0;
	}
	.close {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.units {
		display: flex;
		gap: 4px;
	}
	.units button {
		flex: 1;
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--muted);
		font-size: 12px;
		cursor: pointer;
	}
	.units button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
	}
	.bar {
		display: flex;
		height: 10px;
		border-radius: 5px;
		overflow: hidden;
		border: 1px solid var(--line);
	}
	.bar i {
		flex: 1;
	}
	.marks {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		font-size: 11px;
		color: var(--muted);
		line-height: 1.2;
	}
	.marks span {
		transform: translateX(-50%);
		grid-column: span 1;
	}
	.marks span:first-child {
		grid-column: 2;
	}
	.note {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
</style>
