<script lang="ts">
	// A place in a widget: its sky and temperature, the official warnings that hold it, the rain of the hour to come, the wind
	// measured nearby; the large one adds the gusts AROME-PI forecasts, the days and, when the address names one, a surf spot. A
	// block with nothing to say outside France (no measured wind, no AROME-PI) is left out rather than shown empty.
	import { tOr, type Lang } from '../../i18n';
	import { number } from '../../format';
	import { untilPhrase, warningLabel } from '../../sentence';
	import { sunWindows } from '../../tv/sun';
	import type { TvScreen } from '../../tv/model';
	import { compass, skyLabel } from '../../weather';
	import {
		clockLabel,
		dayLabel,
		daysView,
		gustForecast,
		nearestWind,
		phenomenonLabel,
		rainView,
		skyKind,
		tempColour,
		vigilanceView
	} from '../model';
	import type { WidgetSize, WidgetTheme } from '../params';
	import type { PlaceWidget } from '../placeWidget.svelte';
	import { widgetText, type WidgetKey } from '../text';
	import Arrow from './Arrow.svelte';
	import Glyph from './Glyph.svelte';
	import SkyIcon from './SkyIcon.svelte';
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
	const w = $derived(widget.w);
	const current = $derived(w?.current ?? null);
	const place = $derived(widget.place);
	const night = $derived.by(() => {
		if (!place) return false;
		const windows = sunWindows(place.lat, place.lon, now);
		return windows.length > 0 && !windows.some(([rise, set]) => now >= rise && now < set);
	});
	const rain = $derived(rainView(w, now));
	const vigilance = $derived(
		vigilanceView(
			widget.official,
			widget.here,
			(x) =>
				phenomenonLabel(
					x,
					(p) => tOr(lang, `phen.${p}`, ''),
					(y) => warningLabel(y, lang)
				),
			now
		)
	);
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
	const measured = $derived(
		place && widget.wind?.status === 'ok' && widget.wind.value
			? nearestWind(widget.wind.value.points, place, now)
			: null
	);
	const gust = $derived(gustForecast(w, now));
	const days = $derived(daysView(w, now, 5));
	const temp = $derived(current?.tempC == null ? null : Math.round(current.tempC));
	const weatherNote = $derived(
		widget.weather?.status === 'budget'
			? tx('weatherBudget')
			: widget.weather?.status === 'error'
				? tx('weatherFailed')
				: null
	);

	const levelVar = (level: string | null) =>
		level === 'RED'
			? 'var(--red)'
			: level === 'ORANGE'
				? 'var(--orange)'
				: level === 'YELLOW'
					? 'var(--yellow)'
					: 'var(--t3)';
	const rainTitle = $derived(
		rain.status === 'now'
			? tx('rainNow')
			: rain.status === 'soon'
				? tx('rainSoon', { n: rain.inMin ?? 0 })
				: rain.status === 'none'
					? tx('rainNone')
					: widget.weather == null || widget.weather.status === 'loading'
						? tx('rainLoading')
						: tx('rainUnknown')
	);
	const rainDetail = $derived(
		rain.status === 'now' || rain.status === 'soon'
			? `${tx('rainFor', { n: rain.forMin ?? 0 })} · ${tx('rainUpTo', { v: number(lang, rain.maxMmH, 1) })}`
			: rain.status === 'none'
				? tx('rainForecast')
				: (weatherNote ?? '')
	);
	const vigilanceTitle = $derived(
		vigilance.level
			? tx(`level.${vigilance.level}` as WidgetKey)
			: vigilance.state === 'none' || vigilance.state === 'unplaced'
				? tx('vigilanceNone')
				: vigilance.state === 'nosource'
					? tx('vigilanceNoSource')
					: vigilance.state === 'failed'
						? tx('vigilanceFailed')
						: tx('vigilanceLoading')
	);
	const vigilanceUntil = $derived(
		vigilance.level && vigilance.until ? untilPhrase(lang, vigilance.until, now) : null
	);
	const vigilanceDetail = $derived(vigilance.labels.join(' · '));
	const windLine = $derived.by(() => {
		if (measured) {
			const p = measured.point;
			return {
				from: p.fromDeg,
				kmh: Math.round(p.kmh),
				dir: p.fromDeg == null ? '' : compass(lang, p.fromDeg),
				gust: p.gustKmh == null ? null : Math.round(p.gustKmh),
				note: p.name
					? tx('measuredAt', { name: p.name, n: measured.ageMin })
					: tx('measuredNear', { km: Math.round(measured.km), n: measured.ageMin })
			};
		}
		if (current?.windKmh == null) return null;
		return {
			from: current.windDeg,
			kmh: Math.round(current.windKmh),
			dir: current.windDeg == null ? '' : compass(lang, current.windDeg),
			gust: current.gustKmh == null ? null : Math.round(current.gustKmh),
			note: tx('rainForecast')
		};
	});
</script>

{#snippet header(big: boolean)}
	<header class="head" class:big>
		{#if big && current}<SkyIcon kind={skyKind(current.code)} {night} size={54} />{/if}
		{#if big && temp != null}<span class="temp" style:color={tempColour(temp, theme)}>{temp}°</span>{/if}
		<div class="who" class:right={big}>
			<div class="row name" class:end={big}>
				<Glyph name="pin" size={15} /><span class="ellipsis">{name}</span>
			</div>
			{#if condition}<div class="cond t3 ellipsis">{condition}</div>{/if}
		</div>
		{#if !big && current}<span class="push"><SkyIcon kind={skyKind(current.code)} {night} size={42} /></span
			>{/if}
		{#if !big && temp != null}<span class="temp" style:color={tempColour(temp, theme)}>{temp}°</span>{/if}
	</header>
{/snippet}

{#snippet bars(height: number)}
	<div class="bars" style:height="{height}px">
		{#each rain.bars as b, i (i)}
			<i style:height="{b.pct}%" class={b.tone}></i>
		{/each}
	</div>
{/snippet}

{#snippet alertCard()}
	{#if vigilance.level}
		<section class="alert" style:--c={levelVar(vigilance.level)}>
			<div class="row a1">
				<Glyph name="warning" size={18} colour={levelVar(vigilance.level)} />
				<span class="nowrap">{vigilanceTitle}</span>
				{#if vigilanceUntil}<span class="push t2 until ellipsis">{vigilanceUntil}</span>{/if}
			</div>
			<div class="row a2 t2">
				<span class="ellipsis">{vigilanceDetail}</span>
				{#if vigilance.more > 0}<span class="pill more push" style:--c="var(--t3)">+{vigilance.more}</span
					>{/if}
			</div>
		</section>
	{:else}
		<section
			class="card quiet row"
			class:muted={vigilance.state !== 'none' && vigilance.state !== 'unplaced'}
		>
			<Glyph
				name={vigilance.state === 'none' || vigilance.state === 'unplaced' ? 'check' : 'warning'}
				size={17}
				colour="var(--t3)"
			/>
			<span class="t2">{vigilanceTitle}</span>
		</section>
	{/if}
{/snippet}

{#snippet rainCard(inline: boolean)}
	<section class="card rain" class:inline>
		<div class="row p1">
			<Glyph name="umbrella" size={18} colour="var(--rain)" /><span class="ellipsis">{rainTitle}</span>
			{#if inline && (rain.status === 'now' || rain.status === 'soon')}<span class="push inline-bars"
					>{@render bars(20)}</span
				>{/if}
		</div>
		<div class="p2 t3 ellipsis">{rainDetail}</div>
		{#if !inline && rain.bars.length}{@render bars(22)}{/if}
	</section>
{/snippet}

{#snippet windRow()}
	{#if windLine}
		<div class="row wind">
			{#if windLine.from != null}<Arrow from={windLine.from} size={22} />{:else}<Glyph
					name="wind"
					size={20}
					colour="var(--wind)"
				/>{/if}
			<div class="wind-text">
				<div class="v1">
					{windLine.kmh} <span class="t3 unit">{tx('kmh')}</span>
					{windLine.dir}
					{#if windLine.gust != null}<span class="t2 unit">· {tx('gusts', { n: windLine.gust })}</span>{/if}
				</div>
				<div class="v2 t3 ellipsis">{windLine.note}</div>
			</div>
		</div>
	{/if}
{/snippet}

{#if size === 'small'}
	<div class="row l1">
		<span class="row t2 ellipsis"><Glyph name="pin" size={14} />{name}</span>
		{#if vigilance.level}
			<span class="pill push" style:--c={levelVar(vigilance.level)}
				><Glyph name="warning" size={12} colour="var(--on)" weight={2.4} />{tx(
					`short.${vigilance.level}` as WidgetKey
				)}</span
			>
		{/if}
	</div>
	<div class="row l2">
		<Glyph name="umbrella" size={20} colour="var(--rain)" />
		<span class="ellipsis">{rainTitle}</span>
		{#if temp != null}<span class="push" style:color={tempColour(temp, theme)}>{temp}°</span>{/if}
	</div>
	{#if rain.bars.length}{@render bars(22)}{/if}
{:else if size === 'medium'}
	{@render header(false)}
	{@render alertCard()}
	{@render rainCard(false)}
	{@render windRow()}
{:else}
	{@render header(true)}
	{@render alertCard()}
	{@render rainCard(true)}
	{#if windLine || gust}
		<section class="card wind-card">
			{@render windRow()}
			{#if gust}
				<div class="row t2 gust">
					<Glyph name="wind" size={13} colour="var(--wind)" />{tx('gustForecast', {
						n: Math.round(gust.kmh),
						time: clockLabel(lang, gust.at)
					})}
				</div>
			{/if}
		</section>
	{/if}
	{#if days.length}
		<section class="card days" style:grid-template-columns="repeat({days.length}, 1fr)">
			{#each days as d, i (d.date)}
				<div>
					<div class="j" style:color={i ? 'var(--t2)' : 'var(--accent)'}>{dayLabel(lang, d.date)}</div>
					<span class="icon"><SkyIcon kind={skyKind(d.code)} size={30} /></span>
					{#if d.maxC != null}<div class="mx" style:color={tempColour(d.maxC, theme)}>
							{Math.round(d.maxC)}°
						</div>{/if}
					{#if d.minC != null}<div class="mn" style:color={tempColour(d.minC, theme)}>
							{Math.round(d.minC)}°
						</div>{/if}
				</div>
			{/each}
		</section>
	{/if}
	{#if spot}<SpotView screen={spot} {size} {lang} inside />{/if}
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
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
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border-radius: 999px;
		padding: 2px 8px 2px 6px;
		font-size: 12px;
		background: var(--c);
		color: var(--on);
		white-space: nowrap;
		flex: none;
	}
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 6px;
	}
	.bars i {
		flex: 1;
		border-radius: 999px;
		display: block;
	}
	.bars i.dry {
		background: var(--line);
	}
	.bars i.light {
		background: var(--rain-light);
	}
	.bars i.rain {
		background: var(--rain);
	}
	.bars i.heavy {
		background: var(--rain-heavy);
	}
	/* small */
	.l1 {
		height: 20px;
		font-size: 14px;
		gap: 5px;
	}
	.l2 {
		height: 30px;
		font-size: 21px;
		gap: 8px;
	}
	/* header */
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
	}
	.head.big {
		height: 54px;
		gap: 10px;
	}
	.who {
		min-width: 0;
		flex: 1;
	}
	.who.right {
		text-align: right;
	}
	.name {
		font-size: 16px;
		gap: 5px;
	}
	.name.end {
		justify-content: flex-end;
	}
	.cond {
		font-size: 13px;
		margin-top: 3px;
	}
	.temp {
		font-size: 38px;
		line-height: 1;
	}
	.big .temp {
		font-size: 48px;
	}
	/* cards */
	.alert {
		background: color-mix(in srgb, var(--c) 22%, var(--card));
		border: 1.5px solid color-mix(in srgb, var(--c) 65%, transparent);
		border-radius: 12px;
		padding: 7px 10px;
		height: 54px;
	}
	.a1 {
		font-size: 16px;
		gap: 7px;
	}
	.a2 {
		font-size: 13px;
		margin-top: 4px;
		padding-left: 25px;
	}
	.until {
		font-size: 13px;
	}
	.nowrap {
		white-space: nowrap;
	}
	.more {
		padding: 1px 7px;
	}
	.quiet {
		height: 38px;
		padding: 0 10px;
		font-size: 14px;
		gap: 8px;
	}
	.quiet.muted {
		opacity: 0.85;
	}
	.rain {
		padding: 8px 10px 9px;
	}
	.p1 {
		font-size: 17px;
		gap: 7px;
	}
	.p2 {
		font-size: 13px;
		margin: 3px 0 7px 25px;
	}
	.inline .p2 {
		margin-bottom: 0;
	}
	.inline-bars {
		width: 92px;
		flex: none;
	}
	.wind {
		gap: 9px;
		height: 38px;
	}
	.wind-text {
		min-width: 0;
	}
	.v1 {
		font-size: 16px;
		white-space: nowrap;
	}
	.unit {
		font-size: 13px;
	}
	.v2 {
		font-size: 12.5px;
		margin-top: 3px;
	}
	.wind-card {
		padding: 6px 10px 8px;
	}
	.gust {
		font-size: 13px;
		gap: 6px;
		margin-top: 4px;
	}
	.days {
		display: grid;
		padding: 6px 4px;
		text-align: center;
	}
	.j {
		font-size: 13px;
	}
	.icon {
		display: flex;
		justify-content: center;
		margin: 1px 0 -1px;
	}
	.mx {
		font-size: 16px;
	}
	.mn {
		font-size: 13px;
	}
</style>
