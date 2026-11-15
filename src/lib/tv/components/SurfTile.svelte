<script lang="ts">
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { height, heightLabel, speed, speedLabel, type Units } from '#lib/units.js';
	import type { TvSurf } from '../shared.js';
	import { tvText, type TvKey } from '../text.js';

	let { surf, lang, units }: { surf: TvSurf; lang: Lang; units: Units } = $props();

	const bandClass = (b: 0 | 1 | 2 | 3 | null): string => {
		if (b === 3) return 'tv-v-good';
		if (b === 2) return 'tv-v-possible';
		if (b === 1 || b === 0) return 'tv-v-poor';
		return 'tv-v-null';
	};
	const fmtWind = (kmh: number): string => {
		const v = speed(kmh, units.wind);
		return `${units.wind === 'ms' ? number(lang, v, 1) : Math.round(v)} ${speedLabel(lang, units.wind)}`;
	};
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'card.surf')}</div>
	{#if !surf.available}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{:else if surf.spots.length === 0}
		<div class="tv-nodata">
			–<span>{tvText(lang, 'surf.none', { km: number(lang, surf.radiusKm, 0) })}</span>
		</div>
	{:else}
		<ul class="tv-list">
			{#each surf.spots as spot (spot.id)}
				<li class="tv-item tv-surf-item">
					<span class="tv-badge {bandClass(spot.band)}"
						>{spot.points != null && spot.outOf != null ? `${spot.points}/${spot.outOf}` : '–'}</span
					>
					<div class="tv-item-body">
						<div class="tv-item-title tv-t34">
							{spot.name}
							<span class="tv-mut tv-t24">· {number(lang, spot.km, 0)} km</span>
						</div>
						<div class="tv-sub tv-mut tv-t26">
							{[
								spot.swellM != null
									? `${tvText(lang, 'swell')} ${number(lang, height(spot.swellM, units.height), 1)} ${heightLabel(units.height)}${spot.periodS != null ? ` (${number(lang, spot.periodS, 0)} s)` : ''}`
									: null,
								spot.windKmh != null
									? `${tvText(lang, 'wind')} ${fmtWind(spot.windKmh)}${spot.relative ? ` · ${tvText(lang, spot.relative as TvKey)}` : ''}`
									: null,
								spot.best
									? `${tvText(lang, 'surf.best')} ${spot.best.time} (${spot.best.points}/${spot.best.outOf})`
									: null
							]
								.filter(Boolean)
								.join(' · ')}
						</div>
					</div>
				</li>
			{/each}
		</ul>
		{#if surf.stale}
			<div class="tv-sub tv-mut tv-t22">{tvText(lang, 'surf.stale')}</div>
		{/if}
	{/if}
</div>
