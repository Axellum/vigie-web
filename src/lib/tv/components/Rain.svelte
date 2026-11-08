<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { TvRain } from '../model.js';
	import { tvText, type TvKey } from '../text.js';

	// The rain of the next hour, in the middle of the head so that every preset and every panel has it: one bar per step of the
	// forecast (the height says how much), then a word. The bars are a forecast of the weather model: the caption says so.
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

<div class="tv-rain tv-rain-{rain.status}{rain.level ? ` tv-rain-${rain.level}` : ''}" id="tv-rain">
	<div class="tv-cap tv-t24">{tvText(lang, 'rain')}</div>
	<div class="tv-rain-row">
		<div class="tv-rain-bars" aria-hidden="true">
			{#each rain.bars as bar, i (i)}<span
					class="tv-rain-bar{bar.wet ? ' tv-rain-wet' : ''}"
					style="height:{bar.pct}%"
				></span>{/each}
		</div>
		<div class="tv-rain-text">
			<div class="tv-display tv-rain-word">{word}</div>
			{#if rain.status === 'some' && rain.maxMmH != null}
				<div class="tv-mut tv-t26">{tvText(lang, 'rainUpTo', { v: number(lang, rain.maxMmH, 1) })}</div>
			{/if}
		</div>
	</div>
</div>
