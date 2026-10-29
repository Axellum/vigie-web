<script lang="ts">
	// The three days of a spot in one picture, as the API gives them hour by hour: the primary swell (bars, coloured by the
	// rating of the hour) and its period (dots), the wind and its gusts, the tide; the night in grey, the current hour and the
	// best slot marked. Drawn at the width of the page, so that its words keep their size on a phone. A value the API did not
	// give is not drawn. The hours below the chart give the same figures as text.
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { band, dayKey, SURF_TIME_ZONE, surfText, type SurfHour } from '#lib/surf.js';

	let {
		lang,
		hours,
		best = null,
		now
	}: { lang: Lang; hours: SurfHour[]; best?: number | null; now: number } = $props();

	let width = $state(640);
	const HOUR = 3600;
	const LEFT = 34;
	const RIGHT = 30;
	const TOP = 34;
	const SWELL_H = 110;
	const WIND_H = 70;
	const TIDE_H = 46;
	const GAP = 26;
	const windTop = TOP + SWELL_H + GAP;
	const tideTop = windTop + WIND_H + GAP;
	const H = tideTop + TIDE_H + 8;

	const t0 = $derived(hours[0]?.t ?? 0);
	const t1 = $derived((hours.at(-1)?.t ?? 0) + HOUR);
	const inner = $derived(Math.max(120, width - LEFT - RIGHT));
	const x = (t: number) => LEFT + ((t - t0) / Math.max(HOUR, t1 - t0)) * inner;
	const barW = $derived(Math.max(1, inner / Math.max(1, hours.length) - 1));

	const values = (pick: (h: SurfHour) => number | null | undefined) =>
		hours.map(pick).filter((v): v is number => v != null && Number.isFinite(v));
	const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
	// Whole metres, so that the half is a round figure too (0.5 m, 1 m…).
	const swellMax = $derived(ceilTo(Math.max(1, ...values((h) => h.swell.height)), 1));
	const periodMax = $derived(ceilTo(Math.max(14, ...values((h) => h.swell.period)), 2));
	const windMax = $derived(ceilTo(Math.max(20, ...values((h) => h.wind.gust ?? h.wind.speed)), 10));
	const tideRange = $derived.by(() => {
		const t = values((h) => h.tide?.height);
		return t.length ? { low: Math.min(...t), high: Math.max(...t) } : null;
	});

	const ySwell = (v: number) => TOP + SWELL_H - (v / swellMax) * SWELL_H;
	const yPeriod = (v: number) => TOP + SWELL_H - (v / periodMax) * SWELL_H;
	const yWind = (v: number) => windTop + WIND_H - (v / windMax) * WIND_H;
	const yTide = (v: number) =>
		tideRange && tideRange.high > tideRange.low
			? tideTop + TIDE_H - ((v - tideRange.low) / (tideRange.high - tideRange.low)) * TIDE_H
			: tideTop + TIDE_H / 2;

	/** A polyline through the hours that have a value; a gap breaks it. */
	function line(pick: (h: SurfHour) => number | null | undefined, y: (v: number) => number): string {
		let d = '';
		let open = false;
		for (const h of hours) {
			const v = pick(h);
			if (v == null) {
				open = false;
				continue;
			}
			d += `${open ? 'L' : 'M'}${(x(h.t) + x(h.t + HOUR)) / 2},${y(v)}`;
			open = true;
		}
		return d;
	}

	// The night: runs of hours the API says are not daylight.
	const nights = $derived.by(() => {
		const runs: { from: number; to: number }[] = [];
		for (const h of hours) {
			if (h.daylight !== false) continue;
			const last = runs.at(-1);
			if (last && last.to === h.t) last.to = h.t + HOUR;
			else runs.push({ from: h.t, to: h.t + HOUR });
		}
		return runs;
	});
	// The first hour of each day in the spots' time zone; a day too short on the chart for its name (the rest of today on a
	// phone) keeps its line only.
	const dayStarts = $derived.by(() => {
		const starts = hours.filter((h, i) => i === 0 || dayKey(h.t) !== dayKey(hours[i - 1].t));
		return starts.map((h, i) => {
			const end = i + 1 < starts.length ? x(starts[i + 1].t) : LEFT + inner;
			return { t: h.t, named: end - x(h.t) >= 52 };
		});
	});
	const dayName = (t: number) =>
		new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
			timeZone: SURF_TIME_ZONE,
			weekday: 'short',
			day: 'numeric'
		}).format(t * 1000);
	const nowInside = $derived(now >= t0 && now <= t1);
	const bestInside = $derived(best != null && best >= t0 && best < t1);
</script>

<div class="chart" bind:clientWidth={width}>
	<svg
		width={inner + LEFT + RIGHT}
		height={H}
		viewBox="0 0 {inner + LEFT + RIGHT} {H}"
		role="img"
		aria-label={surfText(lang, 'chart')}
	>
		{#each nights as n (n.from)}
			<rect x={x(n.from)} y={TOP - 4} width={x(n.to) - x(n.from)} height={H - TOP - 4} class="night" />
		{/each}
		{#if bestInside && best != null}
			<rect
				x={x(best)}
				y={TOP - 4}
				width={Math.max(3, x(best + HOUR) - x(best))}
				height={H - TOP - 4}
				class="best"
			/>
			<text
				x={x(best) + 4}
				y={TOP - 9}
				class="label best-label"
				text-anchor={x(best) > LEFT + inner * 0.7 ? 'end' : 'start'}>{surfText(lang, 'chartBest')}</text
			>
		{/if}
		{#each dayStarts as d (d.t)}
			<line x1={x(d.t)} x2={x(d.t)} y1={TOP - 4} y2={H} class="day" />
			{#if d.named}<text x={x(d.t) + 3} y="11" class="label">{dayName(d.t)}</text>{/if}
		{/each}

		<!-- The swell: bars by the rating of the hour, the period as dots on its own scale (right). -->
		<line x1={LEFT} x2={LEFT + inner} y1={TOP + SWELL_H} y2={TOP + SWELL_H} class="axis" />
		{#each [swellMax / 2, swellMax] as v (v)}
			<line x1={LEFT} x2={LEFT + inner} y1={ySwell(v)} y2={ySwell(v)} class="grid" />
			<text x={LEFT - 4} y={ySwell(v) + 4} class="label" text-anchor="end">{number(lang, v, 1)}</text>
			<text x={LEFT + inner + 4} y={yPeriod((v / swellMax) * periodMax) + 4} class="label"
				>{number(lang, (v / swellMax) * periodMax, 0)}</text
			>
		{/each}
		{#each hours as h (h.t)}
			{#if h.swell.height != null}
				<rect
					x={x(h.t)}
					y={ySwell(h.swell.height)}
					width={barW}
					height={TOP + SWELL_H - ySwell(h.swell.height)}
					class="bar surf-q{band(h.rating) ?? 'n'}"
				/>
			{/if}
			{#if h.swell.period != null}
				<circle cx={x(h.t) + barW / 2} cy={yPeriod(h.swell.period)} r="1.6" class="period" />
			{/if}
		{/each}
		<text x={LEFT} y={TOP + SWELL_H + 14} class="label title">{surfText(lang, 'chartSwell')}</text>
		<text x={LEFT + inner} y={TOP + SWELL_H + 14} class="label title" text-anchor="end"
			>{surfText(lang, 'chartPeriod')}</text
		>

		<!-- The wind and its gusts. -->
		<line x1={LEFT} x2={LEFT + inner} y1={windTop + WIND_H} y2={windTop + WIND_H} class="axis" />
		{#each [windMax / 2, windMax] as v (v)}
			<line x1={LEFT} x2={LEFT + inner} y1={yWind(v)} y2={yWind(v)} class="grid" />
			<text x={LEFT - 4} y={yWind(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
		{/each}
		<path d={line((h) => h.wind.gust, yWind)} class="gust" />
		<path d={line((h) => h.wind.speed, yWind)} class="wind" />
		<text x={LEFT} y={windTop + WIND_H + 14} class="label title">{surfText(lang, 'chartWind')}</text>

		<!-- The tide (computed by the API). -->
		{#if tideRange}
			<path d={line((h) => h.tide?.height, yTide)} class="tide" />
			<text x={LEFT - 4} y={yTide(tideRange.high) + 4} class="label" text-anchor="end"
				>{number(lang, tideRange.high, 1)}</text
			>
			<text x={LEFT - 4} y={yTide(tideRange.low) + 4} class="label" text-anchor="end"
				>{number(lang, tideRange.low, 1)}</text
			>
			<text x={LEFT + inner} y={tideTop - 4} class="label title" text-anchor="end"
				>{surfText(lang, 'chartTide')}</text
			>
		{/if}

		{#if nowInside}
			<line x1={x(now)} x2={x(now)} y1={TOP - 4} y2={H} class="now" />
		{/if}
	</svg>
</div>

<style>
	.chart {
		width: 100%;
		min-width: 0;
		overflow: hidden;
	}
	svg {
		display: block;
		max-width: 100%;
	}
	.night {
		fill: color-mix(in srgb, var(--muted) 14%, transparent);
	}
	.best {
		fill: color-mix(in srgb, var(--accent) 18%, transparent);
		stroke: var(--accent);
		stroke-width: 1;
	}
	.day {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	.bar {
		stroke: color-mix(in srgb, var(--ink) 20%, transparent);
		stroke-width: 0.5;
	}
	.bar.surf-q0 {
		fill: var(--surf-q0);
	}
	.bar.surf-q1 {
		fill: var(--surf-q1);
	}
	.bar.surf-q2 {
		fill: var(--surf-q2);
	}
	.bar.surf-q3 {
		fill: var(--surf-q3);
	}
	.bar.surf-qn {
		fill: transparent;
		stroke: var(--muted);
		stroke-dasharray: 2 2;
	}
	.period {
		fill: var(--ink);
	}
	.wind {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.gust {
		fill: none;
		stroke: var(--muted);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}
	.tide {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1.5;
	}
	.now {
		stroke: var(--ink);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.label {
		font-family: var(--font-data);
		font-size: 11px;
		fill: var(--muted);
	}
	.title {
		fill: var(--ink);
	}
	.best-label {
		fill: var(--accent);
	}
</style>
