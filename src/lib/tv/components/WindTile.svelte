<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvWind } from '../model.js';
	import { tvText } from '../text.js';
	import Bars from './Bars.svelte';
	import WindArrow from './WindArrow.svelte';

	let { wind, lang, compact = false }: { wind: TvWind | null; lang: Lang; compact?: boolean } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'wind')}</div>
	{#if wind && wind.kn != null}
		<div class="tv-wind-main">
			<WindArrow deg={wind.deg} size={compact ? 11 : 13} />
			<div class="tv-nowrap">
				<span class="tv-num {compact ? 'tv-n120' : 'tv-n150'}">{Math.round(wind.kn)}</span>
				<span class="tv-unit">{tvText(lang, 'knots')}</span>
			</div>
		</div>
		<div class="tv-line">
			{tvText(lang, 'gusts')} <b>{wind.gustKn == null ? '–' : Math.round(wind.gustKn)}</b> · {tvText(
				lang,
				'force'
			)}
			<b>{wind.force ?? '–'}</b>
		</div>
		<div class="tv-sub tv-mut">{[wind.word, wind.from, wind.relative].filter(Boolean).join(' · ')}</div>
		<!-- The compact tile (beside a large card) keeps the figures: the hours are on the dial. -->
		{#if !compact}
			<div class="tv-grow tv-bars-box"><Bars bars={wind.bars} /></div>
		{/if}
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
