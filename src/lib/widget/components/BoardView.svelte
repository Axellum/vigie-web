<script lang="ts">
	// A place in a widget, in the look of the home page of the Home Assistant card (piste B of the sketches of 2026-11-27, « the
	// columns first »). Compact: the weather now, six « Lueur » columns hour by hour, and under them the rain of the hour with its
	// bars and the warning's pill. Medium: the place, the weather now and the warning in the header, the rain of the hour on one
	// line, the next 24 hours by three. Large: the same, then five days as two curves, and the surf spot when the address names
	// one. The drawings are made at the size the page measures (boardArt.ts); a block without data is left out.
	import type { Lang } from '../../i18n';
	import { sunWindows } from '../../tv/sun';
	import type { TvScreen } from '../../tv/model';
	import { skyLabel } from '../../weather';
	import {
		atNight,
		barHeight,
		boardPalette,
		dayColumns,
		hourSlots,
		levelColour,
		pillWords,
		rainBars,
		rainColour,
		rainEnd,
		rainFirst,
		tempColour,
		wmoKind
	} from '../board';
	import { daysSvg, glowRamp, hourLabel, hoursSvg, iconSvg } from '../boardArt';
	import { rainView, vigilanceView } from '../model';
	import type { WidgetSize, WidgetTheme } from '../params';
	import type { PlaceWidget } from '../placeWidget.svelte';
	import { labelOf } from '../summary';
	import { widgetText, type WidgetKey } from '../text';
	import Glyph from './Glyph.svelte';
	import SpotView from './SpotView.svelte';

	let {
		widget,
		name,
		size,
		theme,
		lang,
		now,
		spot
	}: {
		widget: PlaceWidget;
		name: string;
		size: WidgetSize;
		theme: WidgetTheme;
		lang: Lang;
		now: number;
		spot: TvScreen | null;
	} = $props();

	const tx = (key: WidgetKey, vars: Record<string, string | number> = {}) => widgetText(lang, key, vars);
	const P = $derived(boardPalette(theme));
	const w = $derived(widget.w);
	const current = $derived(w?.current ?? null);
	const place = $derived(widget.place);
	const offset = $derived(w?.utcOffsetS ?? 0);
	const night = $derived.by(() => {
		if (!place) return false;
		const windows = sunWindows(place.lat, place.lon, now);
		return windows.length > 0 && !windows.some(([rise, set]) => now >= rise && now < set);
	});
	const temp = $derived(current?.tempC == null ? null : Math.round(current.tempC));
	const kind = $derived(current ? atNight(wmoKind(current.code), !night) : null);
	const condition = $derived(
		current
			? [
					skyLabel(lang, current.code),
					current.feelsLikeC == null ? null : tx('feels', { t: Math.round(current.feelsLikeC) })
				]
					.filter(Boolean)
					.join(' · ')
			: ''
	);

	// --- the warning ---
	const vigilance = $derived(vigilanceView(widget.official, widget.here, labelOf(lang), now));
	const pill = $derived(pillWords(lang, vigilance, size === 'small'));
	const quiet = $derived(
		vigilance.state === 'none' || vigilance.state === 'unplaced'
			? tx('quiet')
			: vigilance.state === 'nosource'
				? tx('vigilanceNoSource')
				: vigilance.state === 'failed'
					? tx('vigilanceFailed')
					: tx('vigilanceLoading')
	);
	const calm = $derived(vigilance.state === 'none' || vigilance.state === 'unplaced');

	// --- the rain of the hour: the card's rule, unless the reading is too old to say it ---
	const read = $derived(rainView(w, now));
	const bars = $derived(read.status === 'unknown' ? [] : rainBars(w, now));
	const first = $derived(rainFirst(bars, now));
	const end = $derived(rainEnd(bars));
	const rainHead = $derived(
		first === null
			? widget.weather?.status === 'budget'
				? tx('weatherBudget')
				: widget.weather?.status === 'error'
					? tx('weatherFailed')
					: widget.weather == null || widget.weather.status === 'loading'
						? tx('rainLoading')
						: tx('rainUnknown')
			: first < 0
				? tx('rainNone')
				: first === 0
					? tx('rainNow')
					: tx('rainSoon', { n: first })
	);

	// --- the columns ---
	const hourly = $derived(size === 'small' ? hourSlots(w, now, 1, 6) : hourSlots(w, now, 3, 8));
	const days = $derived(
		size === 'large' || (size === 'medium' && !hourly.length) ? dayColumns(w, now, lang, 5) : []
	);
	let hw = $state(0),
		hh = $state(0),
		dw = $state(0),
		dh = $state(0);
	const hoursArt = $derived(
		size === 'small'
			? hoursSvg(P, lang, hourly, hw, hh, {
					rows: ['head', 'icon', 'temp'],
					step: 1,
					offsetS: offset,
					icon: 18,
					rx: 7
				})
			: hoursSvg(P, lang, hourly, hw, hh, {
					rows: ['icon', 'curve', 'mm', 'wind', 'foot'],
					step: 3,
					offsetS: offset
				})
	);
	const daysArt = $derived(daysSvg(P, lang, days, dw, dh));
</script>

{#snippet rainBarsRow(height: number, width: string)}
	<span class="bars" style:height="{height}px" style:width>
		{#each bars as b, i (i)}
			<i style:height="{barHeight(b.r, height)}px" style:background={b.r > 0 ? rainColour(P, b.r) : P.hollow}
			></i>
		{/each}
	</span>
{/snippet}

{#snippet warning(fs: number)}
	{#if pill}
		<span
			class="pill"
			style:font-size="{fs}px"
			style:background={levelColour(P, vigilance.level)}
			style:color={P.on}
			title={vigilance.labels.join(' · ') || undefined}
			><Glyph name="warning" size={fs + 2} colour={P.on} weight={2.4} /><span class="ellipsis">{pill}</span
			></span
		>
	{:else}
		<span class="quiet" style:font-size="{fs}px" style:color={P.t3}
			>{#if calm}<i class="dot" style:background={P.green}></i>{/if}<span class="ellipsis">{quiet}</span
			></span
		>
	{/if}
{/snippet}

{#if size === 'small'}
	<div class="compact">
		<div class="now">
			<span class="row">
				{#if kind}<span class="ic">{@html iconSvg(P, kind, 30)}</span>{/if}
				{#if temp != null}<b class="big" style:color={tempColour(P, temp)}>{temp}°</b>{/if}
			</span>
			<span class="row where"
				><Glyph name="pin" size={12} colour={P.t2} /><span class="ellipsis">{name}</span></span
			>
		</div>
		{#if hourly.length}
			<div class="draw" bind:clientWidth={hw} bind:clientHeight={hh}>
				{@html hoursArt}
			</div>
		{:else if condition}
			<div class="cond t2">{condition}</div>
		{/if}
	</div>
	<div class="rain compact-rain">
		<Glyph name="umbrella" size={13} colour={P.rain} weight={2.4} />
		<b class="ellipsis what">{rainHead}</b>
		<!-- Next to a pill, a dry hour leaves its flat bars out: the room goes to the words. -->
		{#if bars.length && !(pill && first !== null && first < 0)}{@render rainBarsRow(14, 'auto')}{:else}<span
				class="push"
			></span>{/if}
		{#if !pill && end != null}
			<span class="end" style:color={P.t3}>{hourLabel(lang, end, offset)}</span>
		{:else}
			{@render warning(10)}
		{/if}
	</div>
{:else}
	<header class="head">
		<Glyph name="pin" size={15} colour={P.t2} />
		<b class="ellipsis name">{name}</b>
		{#if kind}<span class="ic">{@html iconSvg(P, kind, 22)}</span>{/if}
		{#if temp != null}<b class="temp" style:color={tempColour(P, temp)}>{temp}°</b>{/if}
		<span class="push"></span>
		{@render warning(11)}
	</header>
	<div class="rain">
		<Glyph name="umbrella" size={16} colour={P.rain} weight={2.2} />
		<b class="ellipsis what" class:sized={bars.length > 0}>{rainHead}</b>
		<span class="push"></span>
		{#if bars.length}{@render rainBarsRow(16, 'auto')}{/if}
	</div>
	{#if hourly.length}
		<section
			class="hours"
			class:large={size === 'large'}
			data-drop={size === 'large' && days.length ? 2 : undefined}
		>
			{#if size === 'large'}
				<div class="title" style:color={P.t3}>
					<b>{tx('hoursBy', { n: 3 })}</b>
					<span class="legend" style:color={P.t4}
						>{tx('night')}<i class="ramp" style:background={glowRamp(P)}></i>{tx('sun')}</span
					>
				</div>
			{/if}
			<div class="draw" bind:clientWidth={hw} bind:clientHeight={hh}>
				{@html hoursArt}
			</div>
		</section>
	{/if}
	{#if days.length}
		<section class="days" class:alone={!hourly.length} data-drop={hourly.length ? 1 : undefined}>
			<div class="title" style:color={P.t3}><b>{tx('daysTitle', { n: days.length })}</b></div>
			<div class="draw" bind:clientWidth={dw} bind:clientHeight={dh}>
				{@html daysArt}
			</div>
		</section>
	{/if}
	{#if size === 'large' && spot}<SpotView screen={spot} {size} {lang} inside />{/if}
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.push {
		margin-left: auto;
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.ic {
		display: flex;
		flex: none;
	}
	.ic :global(svg) {
		display: block;
	}
	/* --- the header --- */
	.head {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 24px;
		flex: none;
		min-width: 0;
	}
	.head .name {
		font-size: 15px;
		font-weight: 700;
		flex: 0 1 auto;
	}
	.head .ic {
		margin-left: 2px;
	}
	.temp {
		font-size: 17px;
		font-weight: 700;
		flex: none;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		border-radius: 999px;
		padding: 2px 8px 2px 5px;
		font-weight: 700;
		white-space: nowrap;
		min-width: 0;
		flex: 0 1 auto;
	}
	.quiet {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 600;
		min-width: 0;
		flex: 0 1 auto;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	/* --- the rain of the hour --- */
	.rain {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 22px;
		flex: none;
		min-width: 0;
	}
	.rain .what {
		font-size: 14px;
		font-weight: 700;
	}
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		flex: none;
	}
	/* The title keeps its width and the bars take what is left, from 110 down to 64 px: past that, the title is cut. */
	.rain .what.sized {
		flex: 0 0 auto;
		max-width: calc(100% - 101px);
	}
	.rain .bars {
		flex: 0 1 110px;
		min-width: 64px;
	}
	.bars i {
		flex: 1;
		border-radius: 2px;
		min-width: 2px;
	}
	.compact-rain {
		height: 17px;
		gap: 6px;
	}
	.compact-rain .what {
		font-size: 12px;
		flex: none;
		max-width: 46%;
	}
	.compact-rain .bars {
		flex: 1 1 0;
		min-width: 40px;
	}
	.end {
		font-size: 10px;
		font-weight: 500;
		white-space: nowrap;
		flex: none;
	}
	/* --- the compact size --- */
	.compact {
		display: flex;
		gap: 8px;
		flex: 1 1 0;
		min-height: 52px;
	}
	.compact .now {
		width: 84px;
		flex: none;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
	}
	.big {
		font-size: 31px;
		font-weight: 700;
		line-height: 1;
	}
	.where {
		font-size: 12px;
		font-weight: 700;
		gap: 3px;
	}
	.cond {
		align-self: center;
		font-size: 13px;
		font-weight: 500;
	}
	/* --- the drawings: drawn at the size of their box, which they never push --- */
	.draw {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		min-height: 0;
	}
	.draw > :global(svg) {
		position: absolute;
		inset: 0;
		display: block;
	}
	.hours,
	.days {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-height: 150px;
		flex: 1 1 0;
	}
	.hours.large {
		flex: 52 1 0;
		min-height: 150px;
	}
	.days {
		flex: 48 1 0;
		min-height: 140px;
	}
	.days.alone {
		flex: 1 1 0;
	}
	.title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		height: 15px;
		font-size: 11.5px;
		flex: none;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 10.5px;
		font-weight: 500;
	}
	.ramp {
		display: inline-block;
		width: 44px;
		height: 6px;
		border-radius: 3px;
	}
</style>
