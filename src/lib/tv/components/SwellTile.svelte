<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { TvSwell } from '../model.js';
	import { tvText } from '../text.js';
	import Bars from './Bars.svelte';

	let { swell, lang, waves = false }: { swell: TvSwell | null; lang: Lang; waves?: boolean } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, waves ? 'waves' : 'swell')}</div>
	{#if swell && swell.m != null}
		<div class="tv-swell-main tv-nowrap">
			<span class="tv-num tv-n150">{number(lang, swell.m, 1)}</span>
			<span class="tv-unit">m</span>
		</div>
		<div class="tv-line">
			<b>{swell.periodS == null ? '–' : `${number(lang, swell.periodS, 0)} s`}</b>{#if swell.from}
				· {swell.from}{/if}
		</div>
		{#if swell.bars.length}<div class="tv-grow tv-bars-box"><Bars bars={swell.bars} /></div>{/if}
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
