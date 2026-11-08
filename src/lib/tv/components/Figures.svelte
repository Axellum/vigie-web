<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { TvScreen } from '../model.js';
	import { tvText } from '../text.js';
	import Trend from './Trend.svelte';

	// The figures under the cards of a club: wind, swell, the next tide and the coefficient, in a line.
	let { screen, lang }: { screen: TvScreen; lang: Lang } = $props();
	const { wind, swell, tide } = $derived(screen);
	const next = $derived(tide?.next[0] ? `${tvText(lang, tide.next[0].kind)} ${tide.next[0].time}` : '–');
</script>

<div class="tv-figures">
	<div class="tv-card tv-fig tv-nowrap">
		<div class="tv-cap tv-t24">{tvText(lang, 'wind')}</div>
		<div class="tv-t44">
			{#if wind?.kn != null}<b class="tv-mono">{Math.round(wind.kn)}</b>
				{tvText(lang, 'knotsShort')}
				{#if wind.gustKn != null}<span class="tv-mut"
						>{tvText(lang, 'gustsShort')} {Math.round(wind.gustKn)}</span
					>{/if}{:else}–{/if}
		</div>
	</div>
	<div class="tv-card tv-fig tv-nowrap">
		<div class="tv-cap tv-t24">{tvText(lang, 'swell')}</div>
		<div class="tv-t44">
			{#if swell?.m != null}<b class="tv-mono">{number(lang, swell.m, 1)}</b> m
				{#if swell.periodS != null}<span class="tv-mut">{number(lang, swell.periodS, 0)} s</span
					>{/if}{:else}–{/if}
		</div>
	</div>
	<div class="tv-card tv-fig tv-nowrap">
		<div class="tv-cap tv-t24">{tvText(lang, 'tide')}</div>
		<div class="tv-t44"><Trend trend={tide?.trend ?? null} /> <span class="tv-mono">{next}</span></div>
	</div>
	<div class="tv-card tv-fig tv-nowrap">
		<div class="tv-cap tv-t24">{tvText(lang, 'coefficient')}</div>
		<div class="tv-t44">
			{#if tide?.coefficient != null}<b class="tv-mono">{tide.coefficient}</b>
				<span class="tv-mut tv-t26">{tvText(lang, 'estimate')}</span>{:else}–{/if}
		</div>
	</div>
</div>
