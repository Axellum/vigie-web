<script lang="ts">
	// One spot in short: the colour and the points of the current hour, the swell and the wind now, the best slot of the three
	// days, and how far it is when a place is known. Every figure is the API's; what it did not give is left out.
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { band, slotLabel, surfText, swellText, type SurfSpotNow } from '#lib/surf.js';

	let { lang, spot, km = null }: { lang: Lang; spot: SurfSpotNow; km?: number | null } = $props();

	const rating = $derived(spot.now?.rating ?? null);
	const q = $derived(band(rating));
	const swell = $derived(spot.now ? swellText(lang, spot.now.swell) : null);
	const wind = $derived.by(() => {
		const w = spot.now?.wind;
		if (!w || w.speed == null) return null;
		const side = w.relative ? ` ${surfText(lang, `relative.${w.relative}`)}` : '';
		return `${surfText(lang, 'wind').toLowerCase()} ${number(lang, w.speed, 0)} km/h${side}`;
	});
</script>

<a class="row" href="/surf/{spot.id}">
	<span class="dot surf-q{q ?? 'n'}" aria-hidden="true"></span>
	<span class="body">
		<span class="head">
			<strong>{spot.name}</strong>
			{#if rating}<span
					class="pts"
					title={surfText(lang, 'points', { points: rating.points, outOf: rating.outOf })}
					>{rating.points}/{rating.outOf}</span
				>{/if}
		</span>
		<span class="muted small"
			>{[spot.place, km != null ? surfText(lang, 'away', { km: number(lang, km, km < 10 ? 1 : 0) }) : null]
				.filter(Boolean)
				.join(' · ')}</span
		>
		{#if swell || wind}
			<span class="small">{surfText(lang, 'now')} : {[swell, wind].filter(Boolean).join(' · ')}</span>
		{/if}
		{#if spot.best}
			<span class="small"
				>{surfText(lang, 'bestShort')} : {slotLabel(lang, spot.best.t)} · {spot.best.points}/{spot.best
					.outOf}</span
			>
		{/if}
	</span>
</a>

<style>
	.row {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.row:hover {
		border-color: var(--accent);
	}
	.dot {
		flex: none;
		width: 14px;
		height: 14px;
		margin-top: 3px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.head {
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.pts {
		font-family: var(--font-data);
		font-size: 13px;
	}
</style>
