<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { TvRain } from '../model.js';
	import { tvText, type TvKey } from '../text.js';

	// The rain of the next hour of a place, as a tile of a panel (the head of /tv has its own, `Rain.svelte`): one bar per step of the
	// forecast of the weather model, then a word. Said as a forecast in the caption, as everywhere else.
	let { rain, lang }: { rain: TvRain; lang: Lang } = $props();
	const WORD: Record<string, TvKey> = {
		none: 'rainNone',
		light: 'rainLight',
		moderate: 'rainModerate',
		heavy: 'rainHeavy',
		unknown: 'rainUnknown'
	};
	const word = $derived(tvText(lang, WORD[rain.level ?? rain.status]));
</script>

<div class="tv-card tv-tile tv-rain-tile tv-rain-{rain.status}{rain.level ? ` tv-rain-${rain.level}` : ''}">
	<div class="tv-cap">{tvText(lang, 'rain')}</div>
	<div class="tv-display tv-rain-word tv-rain-word-big">{word}</div>
	<div class="tv-mut tv-sub">
		{#if rain.status === 'some' && rain.maxMmH != null}{tvText(lang, 'rainUpTo', {
				v: number(lang, rain.maxMmH, 1)
			})}{/if}
	</div>
	<div class="tv-grow"></div>
	{#if rain.bars.length}
		<div class="tv-rain-bars tv-rain-bars-big" aria-hidden="true">
			{#each rain.bars as bar, i (i)}<span
					class="tv-rain-bar{bar.wet ? ' tv-rain-wet' : ''}"
					style="height:{bar.pct}%"
				></span>{/each}
		</div>
	{/if}
</div>
