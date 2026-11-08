<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import { airFigure, type TvAir } from '../shared.js';
	import { tvText } from '../text.js';

	// The air of a place: the European index as the API gives it and the fine particles. No word is added to the index (the API does
	// not give its scale with it), and no colour: a figure is shown as it is.
	let { air, lang }: { air: TvAir | null; lang: Lang } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'air')}</div>
	{#if air && (air.eaqi != null || air.pm25 != null || air.pm10 != null)}
		<div class="tv-swell-main tv-nowrap">
			<span class="tv-num tv-n150">{airFigure(lang, air.eaqi)}</span>
		</div>
		<div class="tv-sub tv-mut">{tvText(lang, 'eaqi')}</div>
		<div class="tv-grow"></div>
		<div class="tv-line tv-t44 tv-nowrap">
			{tvText(lang, 'pm25')} <b>{airFigure(lang, air.pm25, 0)}</b> · {tvText(lang, 'pm10')}
			<b>{airFigure(lang, air.pm10, 0)}</b>
			<span class="tv-mut tv-t30">µg/m³</span>
		</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
