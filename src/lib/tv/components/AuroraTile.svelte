<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { sky, type AuroraLevel } from '#lib/sky.js';
	import type { TvAurora } from '../shared.js';
	import { tvText } from '../text.js';

	let { aurora, lang }: { aurora: TvAurora; lang: Lang } = $props();

	const badgeClass = (level: AuroraLevel | null): string => {
		if (level === 'likely') return 'tv-v-good';
		if (level === 'possible') return 'tv-v-possible';
		if (level === 'unlikely' || level === 'very_unlikely') return 'tv-v-poor';
		return 'tv-v-null';
	};
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'card.sky')} · {tvText(lang, 'sky.aurora')}</div>
	{#if !aurora.available}
		<div class="tv-nodata">–<span>{tvText(lang, 'sky.unavailable')}</span></div>
	{:else}
		{#if aurora.estimate}
			<div class="tv-status-row">
				<span class="tv-badge {badgeClass(aurora.level)}">{tvText(lang, 'sky.estimate')}</span>
			</div>
		{/if}
		{#if aurora.sentence}
			<div class="tv-display tv-t50 tv-aurora-line">{aurora.sentence}</div>
		{/if}
		{#if aurora.activity}
			<div class="tv-line tv-t30">
				<b>{aurora.activity}</b> <span class="tv-mut">· {sky(lang, 'activityNext')}</span>
			</div>
		{/if}
		{#if aurora.ovation}
			{@const o = aurora.ovation}
			<div class="tv-sub tv-mut tv-t26">
				{sky(lang, 'ovationNow')}{lang === 'fr' ? ' :' : ':'}
				{o.strongest == null || o.strongestKm == null
					? sky(lang, 'ovationNone')
					: o.strongestKm <= 50
						? sky(lang, 'ovationHere', { v: o.strongest })
						: sky(lang, 'ovationNear', { v: o.strongest, km: number(lang, o.strongestKm, 0) })}
			</div>
		{/if}
	{/if}
</div>
