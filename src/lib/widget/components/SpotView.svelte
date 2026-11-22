<script lang="ts">
	// A surf spot in a widget: the verdicts of its activities (the site's rules), its swell and its tide, from the same model as the
	// TV screen. Small: the best activity and the others as dots; medium: the four cards and the tide; inside the large widget of a
	// place: one row per activity.
	import { activityText } from '../../activities';
	import type { Lang } from '../../i18n';
	import { number } from '../../format';
	import type { TvActivity, TvScreen } from '../../tv/model';
	import { featured } from '../model';
	import type { WidgetSize } from '../params';
	import { widgetText } from '../text';
	import Glyph, { type GlyphName } from './Glyph.svelte';

	let {
		screen,
		size,
		lang,
		inside = false
	}: { screen: TvScreen; size: WidgetSize; lang: Lang; inside?: boolean } = $props();

	const tx = (key: Parameters<typeof widgetText>[1], vars: Record<string, string | number> = {}) =>
		widgetText(lang, key, vars);
	const verdictWord = (a: TvActivity) => (a.verdict ? activityText(lang, `verdict.${a.verdict}`) : '–');
	const verdictColour = (v: TvActivity['verdict']) => (v ? `var(--${v})` : 'var(--t3)');
	const glyphOf = (id: TvActivity['id']): GlyphName => (id === 'surf' ? 'surf' : id);
	// The site's name of the kite activity names three boards: two are enough in a few hundred pixels.
	const name = (a: TvActivity) => (a.id === 'kite' ? tx('kite') : activityText(lang, `activity.${a.id}`));
	/** The next twelve hours of an activity: wide enough cells in a widget. */
	const HOURS = 12;
	const short = $derived(screen.spot.name.replace(/^(Plage|Spot) (de la |de l’|du |des |de )?/i, ''));
	const best = $derived(featured(screen.activities));
	const others = $derived(screen.activities.filter((a) => a !== best));
	const tideNext = $derived(screen.tide?.next[0] ?? null);
	const swell = $derived(
		screen.swell?.m == null
			? null
			: screen.swell.periodS == null
				? tx('swell', { m: number(lang, screen.swell.m, 1) })
				: tx('swellPeriod', { m: number(lang, screen.swell.m, 1), s: number(lang, screen.swell.periodS, 0) })
	);
</script>

{#snippet band(a: TvActivity)}
	<div class="band">
		{#each a.cells.slice(0, HOURS) as c, i (i)}
			<i style:background={c.verdict ? verdictColour(c.verdict) : 'var(--line)'} class:night={c.night}></i>
		{/each}
	</div>
{/snippet}

{#snippet tideLine(cls: string)}
	{#if tideNext}
		<div class="row {cls}">
			<Glyph name="tide" size={14} colour="var(--rain)" />
			<span>{tx(tideNext.kind === 'high' ? 'high' : 'low', { time: tideNext.time })}</span>
			{#if screen.tide?.coefficient != null}
				<span class="push t3 small">{tx('coefficient', { n: screen.tide.coefficient })}</span>
			{/if}
		</div>
	{/if}
{/snippet}

{#if inside}
	<section class="card spot-rows">
		<div class="row title">
			<Glyph name="waves" size={15} />
			<span class="ellipsis">{screen.spot.name}</span>
			{#if swell}<span class="push t3 small nowrap">{swell}</span>{/if}
		</div>
		{#each screen.activities as a (a.id)}
			<div class="row act-row">
				<span class="row act-name t2"><Glyph name={glyphOf(a.id)} size={13} />{name(a)}</span>
				<span class="act-verdict" style:color={verdictColour(a.verdict)}>{verdictWord(a)}</span>
				{@render band(a)}
			</div>
		{/each}
		{@render tideLine('tide-row t2')}
	</section>
{:else if size === 'small'}
	<div class="row l1">
		<span class="row t2 ellipsis"><Glyph name="waves" size={14} />{short}</span>
		{#if tideNext}
			<span class="row push t3 small nowrap"
				><Glyph name="tide" size={13} />{tx(tideNext.kind === 'high' ? 'high' : 'low', {
					time: tideNext.time
				})}</span
			>
		{/if}
	</div>
	{#if best}
		<div class="row l2">
			<Glyph name={glyphOf(best.id)} size={20} />
			<span>{name(best)}</span>
			<span style:color={verdictColour(best.verdict)}>{verdictWord(best)}</span>
			{#if best.slot}<span class="push t3 small nowrap">{best.slot}</span>{/if}
		</div>
	{/if}
	<div class="row l3 t2">
		{#each others as a (a.id)}
			<span class="row dot-item"
				><i class="dot" style:background={verdictColour(a.verdict)}></i>{name(a).split(',')[0]}</span
			>
		{/each}
	</div>
{:else}
	<div class="row spot-head">
		<Glyph name="waves" size={15} />
		<span class="ellipsis">{screen.spot.name}</span>
		{#if swell}<span class="push t3 small nowrap">{swell}</span>{/if}
	</div>
	<div class="grid">
		{#each screen.activities as a (a.id)}
			<div class="card act">
				<div class="row act-n t2">
					<Glyph name={glyphOf(a.id)} size={13} /><span class="ellipsis">{name(a)}</span>
				</div>
				<div class="act-v" style:color={verdictColour(a.verdict)}>{verdictWord(a)}</div>
				{@render band(a)}
			</div>
		{/each}
	</div>
	{#if screen.tide}
		<div class="card tide">
			{@render tideLine('tide-head')}
			{#if screen.tide.curve}
				<svg class="curve" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
					<path d={screen.tide.curve.area} fill="var(--rain)" opacity="0.18" />
					<path
						d={screen.tide.curve.path}
						fill="none"
						stroke="var(--rain)"
						stroke-width="3"
						vector-effect="non-scaling-stroke"
					/>
					{#if screen.tide.curve.now}
						<line
							x1={screen.tide.curve.now.x * 10}
							y1="0"
							x2={screen.tide.curve.now.x * 10}
							y2="300"
							stroke="var(--accent)"
							stroke-width="2"
							vector-effect="non-scaling-stroke"
						/>
					{/if}
				</svg>
			{/if}
		</div>
	{/if}
	<div class="foot t3">{tx('rules')}</div>
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
	.nowrap {
		white-space: nowrap;
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.small {
		font-size: 12px;
	}
	.band {
		display: flex;
		gap: 2px;
		flex: 1;
	}
	.band i {
		flex: 1;
		height: 5px;
		border-radius: 2px;
		display: block;
	}
	.band i.night {
		opacity: 0.45;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		display: block;
		flex: none;
	}
	/* small */
	.l1 {
		font-size: 14px;
		height: 20px;
	}
	.l2 {
		font-size: 21px;
		height: 30px;
		gap: 8px;
	}
	.l3 {
		font-size: 13px;
		gap: 12px;
		height: 22px;
	}
	.dot-item {
		gap: 5px;
	}
	/* medium */
	.spot-head {
		font-size: 16px;
		height: 20px;
		white-space: nowrap;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 7px;
	}
	.act {
		padding: 5px 9px 6px;
	}
	.act-n {
		font-size: 13px;
		gap: 5px;
	}
	.act-v {
		font-size: 17px;
		margin: 1px 0 4px;
	}
	.tide {
		padding: 6px 10px 5px;
	}
	.tide-head {
		font-size: 14px;
	}
	.curve {
		display: block;
		width: 100%;
		height: 22px;
		margin-top: 3px;
	}
	.foot {
		font-size: 12px;
		text-align: center;
		margin-top: auto;
	}
	/* inside the large widget of a place */
	.spot-rows {
		padding: 8px 10px;
	}
	.title {
		font-size: 15px;
		margin-bottom: 5px;
	}
	.act-row {
		height: 22px;
		font-size: 13px;
	}
	.act-name {
		width: 104px;
		flex: none;
		white-space: nowrap;
		overflow: hidden;
	}
	.act-verdict {
		width: 84px;
		flex: none;
	}
	.act-row .band i {
		height: 6px;
	}
	.tide-row {
		font-size: 13px;
		margin-top: 5px;
		padding-top: 6px;
		border-top: 1.5px solid var(--line);
	}
</style>
