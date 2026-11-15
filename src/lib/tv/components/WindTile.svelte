<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { speed, speedLabel, type Units } from '#lib/units.js';
	import type { TvWind } from '../model.js';
	import { tvText } from '../text.js';
	import Bars from './Bars.svelte';
	import WindArrow from './WindArrow.svelte';

	let {
		wind,
		lang,
		compact = false,
		unit = 'kn'
	}: { wind: TvWind | null; lang: Lang; compact?: boolean; unit?: Units['wind'] } = $props();

	const KMH_PER_KNOT = 1.852;
	const value = (kn: number | null): number | null =>
		kn == null ? null : unit === 'kn' ? kn : speed(kn * KMH_PER_KNOT, unit);
	const format = (v: number): string => (unit === 'ms' ? number(lang, v, 1) : String(Math.round(v)));
	const main = $derived(wind ? value(wind.kn) : null);
	const gust = $derived(wind ? value(wind.gustKn) : null);
	const unitText = $derived(unit === 'kn' ? tvText(lang, 'knots') : speedLabel(lang, unit));
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'wind')}</div>
	{#if wind && main != null}
		<div class="tv-wind-main">
			<WindArrow deg={wind.deg} size={compact ? 11 : 13} />
			<div class="tv-nowrap">
				<span class="tv-num {compact ? 'tv-n120' : 'tv-n150'}">{format(main)}</span>
				<span class="tv-unit">{unitText}</span>
			</div>
		</div>
		<div class="tv-line">
			{tvText(lang, 'gusts')} <b>{gust == null ? '–' : format(gust)}</b> · {tvText(lang, 'force')}
			<b>{wind.force ?? '–'}</b>
		</div>
		<div class="tv-sub tv-mut">{[wind.word, wind.from, wind.relative].filter(Boolean).join(' · ')}</div>
		<!-- The compact tile (beside a large card) keeps the figures: the hours are on the dial. -->
		{#if !compact && wind.bars.length}
			<div class="tv-grow tv-bars-box"><Bars bars={wind.bars} /></div>
		{/if}
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
