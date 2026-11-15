<script lang="ts">
	import { number } from '#lib/format.js';
	import { t, type Key, type Lang } from '#lib/i18n.js';
	import type { Level } from '#lib/types.js';
	import type { TvHazards } from '../shared.js';
	import { tvText } from '../text.js';

	let { hazards, lang }: { hazards: TvHazards; lang: Lang } = $props();

	const badgeClass = (level: Level | null): string => {
		if (level === 'RED' || level === 'ORANGE') return 'tv-v-poor';
		if (level === 'YELLOW') return 'tv-v-possible';
		if (level === 'GREEN') return 'tv-v-good';
		return 'tv-v-null';
	};
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'card.hazards')}</div>
	{#if !hazards.available}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{:else}
		<div class="tv-status-row">
			<span class="tv-display tv-t44">
				{hazards.count
					? tvText(lang, 'hazards.count', { n: hazards.count, km: number(lang, hazards.radiusKm, 0) })
					: tvText(lang, 'hazards.none', { km: number(lang, hazards.radiusKm, 0) })}
			</span>
		</div>
		{#if hazards.fires}
			<div class="tv-sub tv-mut tv-t26">
				{hazards.fires.count === 0
					? tvText(lang, 'hazards.firesNone', { km: number(lang, hazards.fires.radiusKm, 0) })
					: tvText(lang, 'hazards.firesCount', {
							n: hazards.fires.count,
							km: number(lang, hazards.fires.radiusKm, 0)
						})}
			</div>
		{/if}
		{#if hazards.items.length}
			<ul class="tv-list">
				{#each hazards.items as item (item.id)}
					<li class="tv-item">
						<span class="tv-badge tv-badge-sm {badgeClass(item.level)}"
							>{item.level ? t(lang, `level.${item.level}` as Key) : item.category}</span
						>
						<div class="tv-item-body">
							<div class="tv-item-title tv-t30">{item.title}</div>
							<div class="tv-sub tv-mut tv-t24">
								{item.category} · {tvText(lang, 'hazards.km', { km: number(lang, item.distanceKm, 0) })}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
