<script lang="ts">
	// The rain radar's card over the map: the time of the image, a button that plays the last half hour (plus optional PIAF +1h
	// rain nowcast on France), a slider, the legend. It folds into a small button. The images are drawn by the map (MapView),
	// the state is the page's (RadarLayer).
	import { translator, type Lang } from '#lib/i18n.js';
	import { radarTime, rate } from '#lib/radar.js';
	import type { RadarLayer } from '#lib/radarLayer.svelte.js';

	let { lang, radar }: { lang: Lang; radar: RadarLayer } = $props();
	const tr = $derived(translator(lang));

	const data = $derived(radar.data);
	const frame = $derived(radar.activeFrame);
	const isNowcast = $derived(frame?.kind === 'nowcast');
	const time = $derived(radar.epoch === null ? '' : radarTime(lang, radar.epoch));
	const totalFrames = $derived(radar.timeline.length);
	// Share of the slider occupied by observed frames (to position the Observed | PIAF boundary cleanly).
	const splitPct = $derived(
		totalFrames > 1 && radar.hasNowcast
			? Math.round(((radar.observedCount - 1) / (totalFrames - 1)) * 100)
			: 100
	);
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
				<h2 class="eyebrow">
					{#if isNowcast && frame?.leadMinutes != null}
						{tr('radar.nowcastAt', { time, min: frame.leadMinutes })}
					{:else}
						{tr('radar.at', { time })}
					{/if}
				</h2>
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
			{#if radar.hasNowcast}
				<div class="phase" data-testid="radar-phase">
					<button
						type="button"
						class="phase-part"
						class:active={!isNowcast}
						onclick={() => {
							radar.pause();
							radar.choose(radar.observedCount - 1);
						}}
					>
						{tr('radar.phaseObserved')}
					</button>
					<span class="phase-sep" aria-hidden="true">|</span>
					<button
						type="button"
						class="phase-part fc"
						class:active={isNowcast}
						onclick={() => {
							radar.pause();
							radar.choose(radar.observedCount);
						}}
					>
						{tr('radar.phaseNowcast')}
					</button>
				</div>
			{/if}
			<div class="controls">
				<button type="button" class="play" onclick={() => radar.toggle()} aria-pressed={radar.playing}>
					{radar.playing ? tr('radar.pause') : tr('radar.play')}
				</button>
				<div class="slider-wrap">
					<input
						type="range"
						min="0"
						max={Math.max(0, totalFrames - 1)}
						step="1"
						value={radar.index}
						aria-label={tr('radar.slider')}
						aria-valuetext={isNowcast && frame?.leadMinutes != null
							? `${time} (+${frame.leadMinutes} min)`
							: time}
						oninput={(e) => {
							radar.pause();
							radar.choose(Number(e.currentTarget.value));
						}}
					/>
					{#if radar.hasNowcast}
						<span class="split-mark" style:left="{splitPct}%" aria-hidden="true"></span>
					{/if}
				</div>
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
			<p class="note">{tr(isNowcast ? 'radar.nowcastNote' : 'radar.measured')}</p>
		</section>
	{/if}
{/if}

<style>
	.card {
		position: absolute;
		left: 10px;
		/* Over the bar of the moments of the towns' weather when the page shows it (`--map-foot`). */
		bottom: calc(34px + var(--map-foot, 0px));
		z-index: 3;
		width: min(300px, calc(100% - 20px));
		box-sizing: border-box;
		padding: 7px 10px;
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	@media (max-width: 520px) {
		.card {
			bottom: calc(54px + var(--map-foot, 0px));
		}
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
	.phase {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
	}
	.phase-part {
		border: 1px solid transparent;
		background: none;
		padding: 1px 6px;
		border-radius: 999px;
		color: var(--muted);
		cursor: pointer;
		font-size: 11.5px;
	}
	.phase-part.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.phase-part.fc.active {
		border-style: dashed;
	}
	.phase-sep {
		color: var(--line);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.slider-wrap {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}
	.slider-wrap input {
		width: 100%;
		min-width: 0;
		accent-color: var(--accent);
	}
	.split-mark {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--ink);
		opacity: 0.45;
		pointer-events: none;
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
		padding: 0;
		background: none;
		font-size: 11.5px;
		line-height: 1.3;
		color: var(--muted);
	}
	.fold {
		position: absolute;
		left: 10px;
		bottom: calc(26px + var(--map-foot, 0px));
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
