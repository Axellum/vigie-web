<script lang="ts">
	// The small widget of a place, « the frise » (piste F of the sketches of 2026-11-27, chosen by the author): what other weather
	// widgets do not show, the rain of the next hour step by step, readable at a glance. On top the weather now, the place and the
	// warning, discreet (a triangle and its words in the colour of its level, no pill). Then one band: the next hour as its twelve
	// steps of rain on a tint of rain, followed by the next hours or the next days (`fc=days`) in « Lueur » columns. Under it the
	// sentence of the rain, as the Home Assistant card says it: when it comes and how strong, or when the next one comes. The right
	// end of the top row stays empty: the « ··· » menu of the Windows widgets board sits there. The medium and large widgets are the
	// card (CardWidget.svelte), but for a place whose answer the card draws no home page with (outside France): the frise again,
	// its columns larger, in the middle of the height; the large one shows the hours in its band and the days under it.
	import type { Lang } from '../../i18n';
	import { sunWindows } from '../../tv/sun';
	import {
		alpha,
		atNight,
		barHeight,
		boardPalette,
		friseColumns,
		levelColour,
		pillWords,
		rainBars,
		rainColour,
		rainFirst,
		rainNote,
		snowAt,
		tempColour,
		wmoKind
	} from '../board';
	import { friseSvg, hourLabel, iconSvg } from '../boardArt';
	import { rainView, vigilanceView } from '../model';
	import type { WidgetForecast, WidgetSize, WidgetTheme } from '../params';
	import type { PlaceWidget } from '../placeWidget.svelte';
	import { labelOf } from '../summary';
	import { widgetText, type WidgetKey } from '../text';
	import Glyph from './Glyph.svelte';

	let {
		widget,
		name,
		size,
		theme,
		lang,
		now,
		forecast
	}: {
		widget: PlaceWidget;
		name: string;
		size: WidgetSize;
		theme: WidgetTheme;
		lang: Lang;
		now: number;
		forecast: WidgetForecast;
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

	// --- the warning, discreet ---
	const vigilance = $derived(vigilanceView(widget.official, widget.here, labelOf(lang), now));
	const warningWords = $derived(pillWords(lang, vigilance));
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
	const snow = $derived(first !== null && first >= 0 && snowAt(w, now + first * 60));
	const note = $derived(w ? rainNote(w, bars, now) : null);
	// A dry hour followed by a known dry spell is said in one sentence, short enough for the small widget: « Pas de pluie avant
	// après-demain vers 9 h » rather than « Pas de pluie dans l'heure » and a « Prochaine pluie… » cut in the middle.
	const dryHour = $derived(first !== null && first < 0 && note != null && note.kind !== 'strength');
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
				? tx(dryHour ? 'noRain' : 'rainNone')
				: first === 0
					? tx(snow ? 'snowNow' : 'rainNow')
					: tx(snow ? 'snowSoon' : 'rainSoon', { n: first })
	);
	/** `demain `, `samedi `… before an hour that is not today, at the place (the card's dayWord). */
	const dayWord = (ts: number) => {
		const day = (t: number) => Math.floor((t + offset) / 86400);
		const d = day(ts) - day(now);
		if (d <= 0) return '';
		if (d === 1) return `${tx('tomorrow')} `;
		if (d === 2) return `${tx('dayAfter')} `;
		const word = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
			weekday: 'long',
			timeZone: 'UTC'
		}).format((ts + offset) * 1000);
		return `${word.toLowerCase()} `;
	};
	const rainSub = $derived.by(() => {
		if (!note) return '';
		if (note.kind === 'strength') {
			const a = tx(`strength.${note.first}`),
				b = tx(`strength.${note.peak}`);
			return a === b ? a : tx('rainThen', { a, b });
		}
		const at = note.kind === 'next' ? note.at : note.until;
		const key = dryHour
			? note.kind === 'next'
				? 'noRainBefore'
				: 'noRainUntil'
			: note.kind === 'next'
				? 'nextRain'
				: 'dryUntil';
		return tx(key, {
			d: dayWord(at),
			t: hourLabel(lang, at, offset)
		});
	});

	// --- the band: the box of the hour, then the columns ---
	const box = $derived(bars.length > 0);
	const big = $derived(size !== 'small');
	const columns = $derived(
		friseColumns(w, now, lang, size === 'large' ? 'hours' : forecast, box ? 5 : 6, box)
	);
	const days = $derived(size === 'large' ? friseColumns(w, now, lang, 'days', 6, false) : []);
	let cw = $state(0),
		ch = $state(0),
		dw = $state(0),
		dh = $state(0),
		bh = $state(0);
	const look = $derived(big ? { offsetS: offset, icon: 28, temp: 17, label: 12 } : { offsetS: offset });
	const art = $derived(friseSvg(P, lang, columns, cw, ch, look));
	const daysArt = $derived(friseSvg(P, lang, days, dw, dh, look));
</script>

<div class="top" class:tall={big}>
	<span class="now">
		{#if kind}<span class="ic">{@html iconSvg(P, kind, big ? 36 : 30)}</span>{/if}
		{#if temp != null}<b class="big" style:color={tempColour(P, temp)}>{temp}°</b>{/if}
	</span>
	<span class="who">
		<span class="row where"
			><Glyph name="pin" size={12} colour={P.t2} /><span class="ellipsis">{name}</span></span
		>
		{#if warningWords}
			<span
				class="row warn"
				style:color={levelColour(P, vigilance.level)}
				title={vigilance.labels.join(' · ') || undefined}
				><Glyph name="warning" size={12} colour={levelColour(P, vigilance.level)} weight={2.3} /><span
					class="ellipsis">{warningWords}</span
				></span
			>
		{:else}
			<span class="row quiet" style:color={P.t3}
				>{#if calm}<i class="dot" style:background={P.green}></i>{/if}<span class="ellipsis">{quiet}</span
				></span
			>
		{/if}
	</span>
</div>
<div class="band" class:tall={big}>
	{#if box}
		<div class="hour" style:background={alpha(P.rain, 0.12)} style:border-color={alpha(P.rain, 0.45)}>
			<span class="row marks">
				<b style:color={P.rain}>{bars[0].known ? hourLabel(lang, bars[0].at, offset) : ''}</b>
				<span class="push" style:color={P.t3}>{tx('nextHour')}</span>
			</span>
			<span class="bars" bind:clientHeight={bh}>
				{#each bars as b, i (i)}
					<i
						style:height="{barHeight(b.r, bh || 40, 3)}px"
						style:background={b.r > 0 ? rainColour(P, b.r) : P.hollow}
					></i>
				{/each}
			</span>
		</div>
	{/if}
	{#if columns.length}
		<div class="draw" bind:clientWidth={cw} bind:clientHeight={ch}>
			{@html art}
		</div>
	{/if}
</div>
<div class="row say" class:end={big && !days.length}>
	<Glyph name="umbrella" size={14} colour={P.rain} weight={2.3} />
	<b class="head">{rainHead}</b>
	{#if rainSub}<span class="ellipsis sub" style:color={P.t2}>{rainSub}</span>{/if}
</div>
{#if days.length}
	<div class="draw days end" bind:clientWidth={dw} bind:clientHeight={dh}>
		{@html daysArt}
	</div>
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
	/* --- the top row: now, the place and the warning; its right end is the board's « ··· » --- */
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		flex: none;
		min-width: 0;
		padding-right: 34px;
	}
	.now {
		display: flex;
		align-items: center;
		gap: 3px;
		flex: none;
	}
	.big {
		font-size: 30px;
		font-weight: 700;
		line-height: 1;
	}
	.top.tall {
		height: 44px;
		margin-top: auto;
	}
	/* Larger, the frise keeps the height its columns need and stands in the middle of the widget. */
	.band.tall {
		flex: 0 1 150px;
	}
	.draw.days {
		flex: 0 1 120px;
	}
	.end {
		margin-bottom: auto;
	}
	.top.tall .big {
		font-size: 36px;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.where {
		font-size: 12px;
		font-weight: 700;
		gap: 3px;
	}
	.warn,
	.quiet {
		font-size: 10.5px;
		font-weight: 700;
		gap: 3px;
	}
	.quiet {
		font-weight: 600;
		gap: 5px;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex: none;
	}
	/* --- the band --- */
	.band {
		display: flex;
		gap: 6px;
		flex: 1 1 0;
		min-height: 44px;
	}
	.hour {
		width: 36%;
		flex: none;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 3px 5px;
		border: 1px solid;
		border-radius: 6px;
	}
	.marks {
		font-size: 10.5px;
		font-weight: 500;
		height: 13px;
		flex: none;
	}
	.marks b {
		font-weight: 700;
	}
	.bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		flex: 1 1 0;
		min-height: 0;
	}
	.bars i {
		flex: 1;
		border-radius: 2px;
		min-width: 2px;
	}
	/* The columns are drawn at the size of their box, which they never push. */
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
	/* --- the sentence of the rain --- */
	.say {
		gap: 5px;
		height: 18px;
		flex: none;
	}
	.head {
		font-size: 13px;
		font-weight: 700;
		white-space: nowrap;
		flex: none;
	}
	.sub {
		font-size: 11.5px;
		font-weight: 500;
	}
</style>
