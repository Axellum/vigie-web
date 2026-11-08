<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvScreen } from '../model.js';
	import type { TvPreset } from '../params.js';
	import type { Qr } from '../qr.js';
	import BigCard from './BigCard.svelte';
	import Corner from './Corner.svelte';
	import Figures from './Figures.svelte';
	import TideTile from './TideTile.svelte';
	import WindTile from './WindTile.svelte';

	// The answer before the figures: a card per activity, bad news as visible as good. A harbour office has the boat's card large
	// with the wind and the tide beside it, a club the surf and the kite with the figures under them, a shop the four cards.
	let { screen, preset, lang, qr }: { screen: TvScreen; preset: TvPreset; lang: Lang; qr: Qr | null } =
		$props();
	const act = (id: string) => screen.activities.find((a) => a.id === id);
</script>

{#if preset === 'port'}
	<div class="tv-cols">
		<div class="tv-col"><BigCard activity={act('boat')} {lang} /></div>
		<div class="tv-col tv-aside tv-stack">
			<div class="tv-card-slot tv-w09"><WindTile wind={screen.wind} {lang} compact /></div>
			<div class="tv-card-slot tv-w11"><TideTile tide={screen.tide} {lang} /></div>
		</div>
	</div>
{:else if preset === 'club'}
	<div class="tv-cols">
		<div class="tv-col"><BigCard activity={act('surf')} {lang} /></div>
		<div class="tv-col"><BigCard activity={act('kite')} {lang} /></div>
	</div>
	<Figures {screen} {lang} />
{:else}
	<div class="tv-cols">
		<div class="tv-col"><BigCard activity={act('surf')} {lang} small /></div>
		<div class="tv-col"><BigCard activity={act('kite')} {lang} small /></div>
	</div>
	<div class="tv-cols">
		<div class="tv-col"><BigCard activity={act('boat')} {lang} small /></div>
		<div class="tv-col"><BigCard activity={act('shore_fishing')} {lang} small /></div>
	</div>
{/if}
<Corner {qr} {lang} />
