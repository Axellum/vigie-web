<script lang="ts">
	// The tide of a watched zone: at the point of the coast nearest to the zone's centre, among the points of the map layer
	// ($lib/tides, the tiles the site already caches). Nothing is shown for a zone with no coast the model knows.
	import TideSection from '#lib/components/TideSection.svelte';
	import { translator, type Lang } from '#lib/i18n.js';
	import type { Box } from '#lib/geo.js';
	import { nearestCoastPoint, TIDE_LEVELS, tideTilesInView, type TideTile } from '#lib/tides.js';

	let { lang, box, centre }: { lang: Lang; box: Box | null; centre?: { lat: number; lon: number } | null } =
		$props();
	const tr = $derived(translator(lang));
	// The finest level: every cell of the model next to the coast. A zone wider than a few tiles is not looked at.
	const LEVEL = TIDE_LEVELS[TIDE_LEVELS.length - 1];
	const MAX_TILES = 4;

	let point = $state<{ lat: number; lon: number } | null>(null);

	$effect(() => {
		const b = box;
		if (!b) return;
		const c = centre ?? { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2 };
		const tiles = tideTilesInView(LEVEL, b);
		if (!tiles || tiles.length > MAX_TILES) return;
		void (async () => {
			const features: TideTile['features']['features'] = [];
			for (const [x, y] of tiles) {
				const response = await fetch(`/data/tides/${LEVEL.id}/${x}_${y}.json`).catch(() => null);
				if (response?.ok) features.push(...((await response.json()) as TideTile).features.features);
			}
			point = nearestCoastPoint(features, b, c);
		})();
	});
</script>

{#if point}
	<div class="zone-tide">
		<TideSection {lang} at={point} />
		<p class="muted small">{tr('tide.zonePoint')}</p>
	</div>
{/if}

<style>
	.zone-tide {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
