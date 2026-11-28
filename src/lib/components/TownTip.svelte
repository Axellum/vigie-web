<script lang="ts">
	// The short card of a town's pill, under the pointer or the focus (not on a phone, where a tap opens the whole card): now,
	// the rain of the hour by 5 or 15 minutes, the next six hours, the day. The drawings, colours and rules of the Home Assistant
	// card (`widget/board`); the whole card opens on a click.
	import { translator, type Lang } from '#lib/i18n.js';
	import { asPoint, type TownWeather } from '#lib/townWeather.js';
	import { compass, skyLabel } from '#lib/weather.js';
	import {
		atNight,
		barHeight,
		boardPalette,
		glow,
		hourSlots,
		rainBars,
		rainColour,
		rainFirst,
		rainNote,
		tempColour,
		wmoKind
	} from '#lib/widget/board.js';
	import { fmt, hourLabel, iconSvg } from '#lib/widget/boardArt.js';

	let {
		lang,
		name,
		weather,
		now,
		dark,
		left,
		top,
		above = false
	}: {
		lang: Lang;
		name: string;
		weather: TownWeather;
		now: number;
		dark: boolean;
		left: number;
		top: number;
		/** Over the point `top` (the pill near the bottom of the map) rather than under it. */
		above?: boolean;
	} = $props();
	const tr = $derived(translator(lang));
	const P = $derived(boardPalette(dark ? 'dark' : 'light'));
	const w = $derived(asPoint(weather));
	const off = $derived(weather.utcOffsetS ?? 0);
	const c = $derived(weather.current);
	const hour0 = $derived(weather.hourly.find((h) => h.t <= now && now < h.t + 3600) ?? null);
	const day = $derived(hour0?.isDay !== false);
	const kind = $derived(atNight(wmoKind(c?.code ?? hour0?.weatherCode), day));
	const bars = $derived(rainBars(w, now));
	const first = $derived(rainFirst(bars, now));
	const note = $derived(rainNote(w, bars, now));
	const slots = $derived(hourSlots(w, now, 1, 6));
	const today = $derived(
		weather.daily.find((d) => d.date === new Date((now + off) * 1000).toISOString().slice(0, 10))
	);
	const peak = $derived(Math.max(0, ...bars.map((b) => b.r)));
	const css = (stops: { offset: number; colour: string }[]) =>
		`linear-gradient(to bottom,${stops.map((s) => `${s.colour} ${Math.round(s.offset * 100)}%`).join(',')})`;
	const arrow = (from: number | null, colour: string) =>
		from == null
			? ''
			: `<svg width="10" height="10" viewBox="0 0 16 16" style="transform:rotate(${Math.round(from + 180)}deg)" aria-hidden="true"><path d="M8 1.5 L12.5 12 L8 9.6 L3.5 12 Z" fill="${colour}"/></svg>`;
	const rainHead = $derived(
		first == null
			? null
			: first === -1
				? tr('towns.dryHour')
				: first === 0
					? tr('towns.rainNow')
					: tr('towns.rainIn', { minutes: first })
	);
	const rainSub = $derived(
		note?.kind === 'next'
			? tr('towns.nextRain', { time: hourLabel(lang, note.at, off) })
			: note?.kind === 'dry'
				? tr('towns.dryUntil', { time: hourLabel(lang, note.until, off) })
				: note?.kind === 'strength'
					? tr(`towns.rain.${note.peak}`)
					: ''
	);
</script>

<div class="tip" class:above style:left="{left}px" style:top="{top}px" role="tooltip" data-testid="town-tip">
	<header><b>{name}</b><span>{tr('towns.nowAt', { time: hourLabel(lang, now, off) })}</span></header>
	<div class="now">
		{@html iconSvg(P, kind, 46)}
		<span class="t" style:color={tempColour(P, c?.tempC ?? null)}>{fmt(lang, c?.tempC ?? null)}°</span>
		<div class="facts">
			<b>{skyLabel(lang, c?.code ?? null)}</b>
			<small
				>{tr('towns.feels', { t: fmt(lang, c?.feelsLikeC ?? null) })} · {tr('towns.humidity', {
					pct: c?.humidityPct ?? '–'
				})}</small
			>
			<small
				>{@html arrow(c?.windDeg ?? null, P.wind)}
				{fmt(lang, c?.windKmh ?? null)} km/h {compass(lang, c?.windDeg ?? null)} · {tr('towns.gusts', {
					v: fmt(lang, c?.gustKmh ?? null)
				})}</small
			>
		</div>
	</div>
	{#if rainHead}
		<div class="rain">
			<div class="txt">
				<b>{rainHead}</b>{#if rainSub}<small>{rainSub}</small>{/if}
			</div>
			<div class="bars" aria-hidden="true">
				{#each bars.slice(0, 12) as b, i (i)}<i
						style:height="{barHeight(b.r, 22)}px"
						style:background={b.r > 0 ? rainColour(P, b.r) : P.hollow}
					></i>{/each}
			</div>
			<span class="visually-hidden">{peak > 0 ? `${fmt(lang, peak, 1)} mm/h` : ''}</span>
		</div>
	{/if}
	{#if slots.length}
		<div class="hours">
			{#each slots as s, i (s.ts)}
				<div class="col" class:first={i === 0} style:background={css(glow(P, s.sun, s.day))}>
					<small>{hourLabel(lang, s.ts, off)}</small>
					{@html iconSvg(P, s.kind, 22)}
					<b style:color={tempColour(P, s.temp)}>{fmt(lang, s.temp)}°</b>
					<i class="mm" style:color={P.rain}>{s.mm != null && s.mm >= 0.1 ? fmt(lang, s.mm, 1) : ''}</i>
					<i class="wd">{@html arrow(s.deg, P.t3)}{fmt(lang, s.wind)}</i>
				</div>
			{/each}
		</div>
	{/if}
	{#if today}
		<div class="day">
			<span>{tr('towns.today')}</span>
			<b style:color={tempColour(P, today.tmaxC)}>{fmt(lang, today.tmaxC)}°</b>
			<span style:color={tempColour(P, today.tminC)}>{fmt(lang, today.tminC)}°</span>
			<span class="mmd"
				>{today.rainMm != null && today.rainMm >= 0.1
					? `${fmt(lang, today.rainMm, 1)} mm`
					: tr('towns.dry')}</span
			>
		</div>
	{/if}
	<footer>{tr('towns.clickForAll')}</footer>
</div>

<style>
	.tip {
		position: absolute;
		z-index: 6;
		width: 300px;
		padding: 10px 12px 9px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		color: var(--ink);
		font: 400 13px/1.3 var(--font-body);
		pointer-events: none;
	}
	.tip.above {
		transform: translateY(-100%);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 4px;
	}
	header b {
		font: 700 16px/1.2 var(--font-display);
	}
	header span,
	small,
	footer {
		color: var(--muted);
		font-size: 12px;
	}
	.now {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.now .t {
		font: 700 30px/1 var(--font-display);
	}
	.facts {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.facts small {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.rain {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 8px;
		padding-top: 7px;
		border-top: 1px solid var(--line);
	}
	.rain .txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.bars {
		flex: none;
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 22px;
	}
	.bars i {
		width: 5px;
		border-radius: 2px 2px 0 0;
	}
	.hours {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 2px;
		margin-top: 8px;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		padding: 3px 0 4px;
		border-radius: 6px;
	}
	.col.first {
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 60%, transparent);
	}
	.col b {
		font: 700 14px/1.1 var(--font-display);
	}
	.col i {
		font-style: normal;
		font-size: 11px;
		min-height: 13px;
	}
	.col .wd {
		display: flex;
		align-items: center;
		gap: 1px;
		color: var(--muted);
	}
	.day {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 7px;
		padding-top: 6px;
		border-top: 1px solid var(--line);
	}
	.day b {
		font: 700 15px/1 var(--font-display);
	}
	.day .mmd {
		margin-left: auto;
		color: var(--muted);
	}
	footer {
		margin-top: 7px;
	}
</style>
