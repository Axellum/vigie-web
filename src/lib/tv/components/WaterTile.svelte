<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { tvText } from '../text.js';

	// The temperature of the sea at a place: a value of an ocean model for a cell of about 8 km, not a measurement at the beach, and
	// the tile says so under the figure.
	let { waterC, lang }: { waterC: number | null; lang: Lang } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'water')}</div>
	{#if waterC != null}
		<div class="tv-swell-main tv-nowrap">
			<span class="tv-num tv-n150">{number(lang, waterC, 0)}</span>
			<span class="tv-unit">°C</span>
		</div>
		<div class="tv-sub tv-mut">{tvText(lang, 'waterModel')}</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'waterMissing')}</span></div>
	{/if}
</div>
