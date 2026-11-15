<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { height, heightLabel, type Units } from '#lib/units.js';
	import type { TvTide } from '../model.js';
	import { tvText } from '../text.js';
	import TideCurve from './TideCurve.svelte';
	import Trend from './Trend.svelte';

	let { tide, lang, unit = 'm' }: { tide: TvTide | null; lang: Lang; unit?: Units['height'] } = $props();
	const next = $derived(tide?.next.map((e) => `${tvText(lang, e.kind)} ${e.time}`).join(' · ') ?? '');
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'tide')}</div>
	{#if tide}
		<div class="tv-tide-head tv-nowrap">
			<Trend trend={tide.trend} />
			<span class="tv-display tv-t64">{tide.trend ? tvText(lang, tide.trend) : '–'}</span>
		</div>
		<div class="tv-grow tv-curve-box">
			{#if tide.curve}<TideCurve curve={tide.curve} />{/if}
		</div>
		<div class="tv-mono tv-t38 tv-nowrap">{next || '–'}</div>
		<div class="tv-sub tv-mut tv-nowrap">
			{#if tide.coefficient != null}
				{tvText(lang, 'coefficient')} <b>{tide.coefficient}</b> ({tvText(lang, 'estimate')})
			{/if}
			{#if tide.coefficient != null && tide.range != null}
				·
			{/if}
			{#if tide.range != null}{#if unit === 'm'}{tvText(lang, 'range', {
						m: number(lang, tide.range, 1)
					})}{:else}{tvText(lang, 'rangeFt', {
						v: `${number(lang, height(tide.range, unit), 1)} ${heightLabel(unit)}`
					})}{/if}{/if}
		</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
