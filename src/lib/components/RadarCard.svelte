<script lang="ts">
	// The rain radar's card over the map: the time of the image, a button that plays the last half hour, a slider, the legend.
	// It folds into a small button. The images are drawn by the map (MapView), the state is the page's (RadarLayer).
	import { translator, type Lang } from '#lib/i18n.js';
	import { radarTime, rate } from '#lib/radar.js';
	import type { RadarLayer } from '#lib/radarLayer.svelte.js';

	let { lang, radar }: { lang: Lang; radar: RadarLayer } = $props();
	const tr = $derived(translator(lang));

	const data = $derived(radar.data);
	const time = $derived(radar.epoch === null ? '' : radarTime(lang, radar.epoch));
	// The legend: a bar of the classes, and the rates under four of them (the first, and about each step of the scale).
	const classes = $derived(data?.legend ?? []);
	const marks = $derived.by(() => {
		const n = classes.length;
		const picks = [0, 2, 5, n - 1].filter((i, k, all) => i >= 0 && i < n && all.indexOf(i) === k);
		return picks.map((i) => ({ i, text: rate(lang, classes[i].minMmH) }));
	});
	const legendText = $derived(
		`${tr('radar.legend')}: ${classes.map((c) => `≥ ${rate(lang, c.minMmH)}`).join(', ')}`
	);
</script>

{#if radar.shown}
	{#if !radar.open}
		<button type="button" class="fold" onclick={() => (radar.open = true)}>{tr('radar.show')}</button>
	{:else if radar.status === 'failed' && !data}
		<div class="card" role="status">
			<p class="note">{tr('radar.failed')}</p>
		</div>
	{:else if data}
		<section class="card" aria-label={tr('radar.title')} data-testid="radar-card">
			<div class="head">
				<h2 class="eyebrow">{tr('radar.at', { time })}</h2>
				<button
					type="button"
					class="close"
					onclick={() => (radar.open = false)}
					aria-label={tr('radar.hide')}
				>
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
			<div class="controls">
				<button type="button" class="play" onclick={() => radar.toggle()} aria-pressed={radar.playing}>
					{radar.playing ? tr('radar.pause') : tr('radar.play')}
				</button>
				<input
					type="range"
					min="0"
					max={data.frames.length - 1}
					step="1"
					value={radar.index}
					aria-label={tr('radar.slider')}
					aria-valuetext={time}
					oninput={(e) => {
						radar.pause();
						radar.choose(Number(e.currentTarget.value));
					}}
				/>
			</div>
			<div class="bar" role="img" aria-label={legendText}>
				{#each classes as c (c.minMmH)}<i style:background={c.color}></i>{/each}
			</div>
			<div class="marks" style:--n={classes.length} aria-hidden="true">
				{#each marks as m (m.i)}
					<span
						class:last={m.i === classes.length - 1}
						style:grid-column={m.i === classes.length - 1 ? `${Math.max(1, m.i - 1)} / ${m.i + 2}` : m.i + 1}
						>{m.text}{m.i === classes.length - 1 ? ` ${tr('radar.unit')}` : ''}</span
					>
				{/each}
			</div>
			<p class="note">{tr('radar.measured')}</p>
		</section>
	{/if}
{/if}

<style>
	.card {
		position: absolute;
		left: 10px;
		bottom: 26px;
		z-index: 3;
		width: min(290px, calc(100% - 20px));
		box-sizing: border-box;
		padding: 8px 10px 8px;
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
	.controls {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.controls input {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
	}
	.play {
		min-width: 72px;
		padding: 5px 10px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--surface);
		font-weight: 600;
		cursor: pointer;
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
		grid-template-columns: repeat(var(--n, 9), 1fr);
		font-size: 11px;
		color: var(--muted);
		line-height: 1.2;
	}
	.marks .last {
		text-align: right;
		white-space: nowrap;
	}
	.note {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}
	.fold {
		position: absolute;
		left: 10px;
		bottom: 26px;
		z-index: 3;
		padding: 5px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
</style>
