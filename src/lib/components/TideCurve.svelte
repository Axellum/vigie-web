<script lang="ts">
	// The tide of a coastal point over two days, as the API computes it from a global tide model (vigie-api ADR 0015): the curve,
	// the time now, the high and low waters with their ranges, and the French coefficient the API estimates (not the official one).
	// Every figure is the API's. Times are the reader's own; heights are relative to the model's mean sea level.
	import { onMount } from 'svelte';
	import { number } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import {
		curveGeometry,
		extremesShown,
		midnights,
		showsFrenchCoefficient,
		type TideCurve
	} from '#lib/tides.js';

	let { lang, curve, now }: { lang: Lang; curve: TideCurve; now: number } = $props();
	const tr = $derived(translator(lang));
	const LOCALE = { fr: 'fr-FR', en: 'en-GB' } as const;
	const W = 640;
	const H = 170;

	// The server does not know the reader's time zone: until the page runs in the browser, times are UTC.
	let local = $state(false);
	onMount(() => (local = true));
	const timeZone = $derived(local ? undefined : 'UTC');
	const hour = (t: number) =>
		new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit', timeZone }).format(
			new Date(t * 1000)
		);
	const dayHour = (t: number) =>
		new Intl.DateTimeFormat(LOCALE[lang], {
			weekday: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		}).format(new Date(t * 1000));
	const weekday = (t: number) =>
		new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone }).format(new Date(t * 1000));
	const metres = (h: number | null, digits = 2) => (h == null ? '–' : `${number(lang, h, digits)} m`);
	const signed = (h: number) => `${h > 0 ? '+' : ''}${number(lang, h, 2)} m`;

	const geometry = $derived(curveGeometry(curve, W, H));
	const shown = $derived(extremesShown(curve));
	const days = $derived(
		midnights(curve.start, curve.end, (t) => (local ? new Date(t * 1000).getTimezoneOffset() : 0))
	);
	const nowInside = $derived(now >= curve.start && now <= curve.end);
	const french = $derived(curve.cell != null && showsFrenchCoefficient(curve.cell.lat, curve.cell.lon));
	const next = $derived(curve.now?.trend === 'rising' ? curve.now.nextHigh : (curve.now?.nextLow ?? null));
	const zero = $derived(geometry.low < 0 && geometry.high > 0 ? geometry.y(0) : null);
</script>

<div class="tide card">
	{#if curve.now}
		<p class="now">
			<strong>{tr(curve.now.trend === 'rising' ? 'tide.rising' : 'tide.falling')}</strong>
			<span class="data">{signed(curve.now.h)}</span>
			{#if next}
				· {tr(next.kind === 'high' ? 'tide.nextHigh' : 'tide.nextLow', {
					time: hour(next.t),
					h: signed(next.h)
				})}
			{/if}
		</p>
	{/if}

	<svg viewBox="0 0 {W} {H}" role="img" aria-label={tr('tide.chartLabel')} preserveAspectRatio="none">
		<path d={geometry.area} class="area" />
		{#if zero != null}<line x1="0" x2={W} y1={zero} y2={zero} class="zero" />{/if}
		{#each days as t (t)}
			<line x1={geometry.x(t)} x2={geometry.x(t)} y1="0" y2={H} class="day" />
		{/each}
		<path d={geometry.path} class="line" />
		{#each shown as e (e.t)}
			<circle cx={geometry.x(e.t)} cy={geometry.y(e.h)} r="3.5" class={e.kind} />
		{/each}
		{#if nowInside}
			<line x1={geometry.x(now)} x2={geometry.x(now)} y1="0" y2={H} class="nowline" />
		{/if}
	</svg>
	<div class="axis small muted" aria-hidden="true">
		{#each days as t (t)}
			<span style:left="{(geometry.x(t) / W) * 100}%">{weekday(t)}</span>
		{/each}
	</div>

	<ol class="extremes">
		{#each shown as e (e.t)}
			<li class:past={e.t < now}>
				<span class="kind {e.kind}">{tr(e.kind === 'high' ? 'tide.high' : 'tide.low')}</span>
				<span class="data muted small when">{dayHour(e.t)}</span>
				<span class="data">{signed(e.h)}</span>
				{#if e.range != null}<span class="muted small">{tr('tide.range', { r: metres(e.range, 1) })}</span
					>{/if}
			</li>
		{/each}
	</ol>

	{#if french && curve.coefficients.length}
		<p class="coefficients">
			<span>{tr('tide.coefficients')}</span>
			{#each curve.coefficients as c (c.t)}
				<span class="data coefficient" title={dayHour(c.t)}>{c.value}</span>
			{/each}
		</p>
		<p class="muted small">{tr('tide.coefficientNote')}</p>
	{/if}

	<p class="muted small">
		{tr('tide.computed', {
			model: curve.model ?? '–',
			km: curve.cell?.distanceKm != null ? number(lang, curve.cell.distanceKm, 0) : '–'
		})}
		{local ? '' : tr('tide.utc')}
	</p>
	<p class="warn small">{tr('tide.limits')}</p>
</div>

<style>
	.tide {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.now {
		margin: 0;
	}
	svg {
		width: 100%;
		height: 150px;
		display: block;
		overflow: visible;
	}
	.area {
		fill: var(--accent-soft);
	}
	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.zero {
		stroke: var(--line);
		stroke-dasharray: 4 4;
		vector-effect: non-scaling-stroke;
	}
	.day {
		stroke: var(--line);
		vector-effect: non-scaling-stroke;
	}
	.nowline {
		stroke: var(--ink);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	circle.high {
		fill: var(--accent);
	}
	circle.low {
		fill: var(--surface);
		stroke: var(--accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.axis {
		position: relative;
		height: 1.2em;
		margin-top: -6px;
	}
	.axis span {
		position: absolute;
		transform: translateX(4px);
		white-space: nowrap;
	}
	.extremes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 6px 14px;
	}
	.extremes li {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 6px;
		align-items: baseline;
	}
	.extremes li.past {
		opacity: 0.55;
	}
	.kind {
		font-weight: 600;
	}
	.when {
		flex-basis: 100%;
		order: -1;
	}
	.coefficients {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
		margin: 0;
	}
	.coefficient {
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0 8px;
	}
	.warn {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 6px 8px;
		margin: 0;
	}
	p {
		margin: 0;
	}
</style>
