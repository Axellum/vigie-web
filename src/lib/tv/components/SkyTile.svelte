<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { TvSky } from '../model.js';
	import { tvText } from '../text.js';

	let { sky, lang, compact = false }: { sky: TvSky | null; lang: Lang; compact?: boolean } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'sky')}</div>
	{#if sky}
		<div class="tv-sky-main">
			<span class="tv-num {compact ? 'tv-n84' : 'tv-n110'}"
				>{sky.tempC == null ? '–' : `${number(lang, sky.tempC, 0)}°`}</span
			>
			<span class="tv-unit">{sky.label}</span>
		</div>
		<div class="tv-sub tv-mut">
			{#if sky.feelsC != null}{tvText(lang, 'feels')}
				{number(lang, sky.feelsC, 0)}°{/if}{#if sky.feelsC != null && sky.uv != null}
				·
			{/if}{#if sky.uv != null}UV {number(lang, sky.uv, 1)}{/if}
		</div>
		<div class="tv-grow"></div>
		<div class="tv-sky-foot">
			<div class="tv-hatch tv-water">
				{tvText(lang, 'water')} <b>–</b>
				<div class="tv-mut tv-t22">{tvText(lang, 'waterMissing')}</div>
			</div>
			{#if sky.rise && sky.set}
				<div class="tv-sun tv-nowrap">
					<svg class="tv-sun-ico" viewBox="0 0 24 24" aria-hidden="true"
						><circle cx="12" cy="12" r="5" /><path
							d="M12 1v4M12 19v4M1 12h4M19 12h4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M4.2 19.8L7 17M17 7l2.8-2.8"
						/></svg
					>
					{sky.rise} – {sky.set}
				</div>
			{/if}
		</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
