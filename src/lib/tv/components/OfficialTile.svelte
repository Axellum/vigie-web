<script lang="ts">
	import { number } from '#lib/format.js';
	import { t, type Key, type Lang } from '#lib/i18n.js';
	import type { Level } from '#lib/types.js';
	import type { TvOfficial } from '../shared.js';
	import { tvText } from '../text.js';

	let { official, lang }: { official: TvOfficial; lang: Lang } = $props();

	const badgeClass = (level: Level | null): string => {
		if (level === 'RED' || level === 'ORANGE') return 'tv-v-poor';
		if (level === 'YELLOW') return 'tv-v-possible';
		if (level === 'GREEN') return 'tv-v-good';
		return 'tv-v-null';
	};
	const levelLabel = (level: Level | null) => t(lang, `level.${level ?? 'none'}` as Key);
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'card.official')}</div>
	{#if official.kind === 'here'}
		<div class="tv-status-row">
			<span class="tv-badge {badgeClass(official.level)}">{levelLabel(official.level)}</span>
			<span class="tv-display tv-t44">{tvText(lang, 'official.count', { n: official.count })}</span>
		</div>
		<ul class="tv-list">
			{#each official.items as item (item.id)}
				<li class="tv-item">
					<span class="tv-badge tv-badge-sm {badgeClass(item.level)}">{levelLabel(item.level)}</span>
					<div class="tv-item-body">
						<div class="tv-item-title tv-t30">{item.title}</div>
						<div class="tv-sub tv-mut tv-t24">
							{[
								item.area,
								item.until,
								item.distanceKm != null
									? tvText(lang, 'hazards.km', { km: number(lang, item.distanceKm, 0) })
									: null,
								item.source
							]
								.filter(Boolean)
								.join(' · ')}
						</div>
					</div>
				</li>
			{/each}
		</ul>
		{#if official.count > official.items.length}
			<div class="tv-sub tv-mut tv-t24">
				{tvText(lang, 'official.more', { n: official.count - official.items.length })}
			</div>
		{/if}
	{:else if official.kind === 'country'}
		<div class="tv-status-row">
			<span class="tv-badge {badgeClass(official.level)}">{levelLabel(official.level)}</span>
			<span class="tv-display tv-t44">{tvText(lang, 'official.countryOnly', { n: official.count })}</span>
		</div>
	{:else if official.kind === 'none'}
		<div class="tv-nodata">
			<span class="tv-badge tv-v-good">{levelLabel('GREEN')}</span>
			<span>{tvText(lang, 'official.none')}</span>
		</div>
	{:else if official.kind === 'nosource'}
		<div class="tv-nodata">–<span>{tvText(lang, 'official.noSource')}</span></div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'official.failed')}</span></div>
	{/if}
</div>
