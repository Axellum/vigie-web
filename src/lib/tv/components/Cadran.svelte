<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvScreen } from '../model.js';
	import type { TvPreset } from '../params.js';
	import type { Qr } from '../qr.js';
	import Corner from './Corner.svelte';
	import QrTile from './QrTile.svelte';
	import SkyTile from './SkyTile.svelte';
	import SwellTile from './SwellTile.svelte';
	import TideTile from './TideTile.svelte';
	import VerdictTile from './VerdictTile.svelte';
	import WindTile from './WindTile.svelte';
	import ConditionsTile from './ConditionsTile.svelte';

	// The dial: everything of the moment on one screen, in three columns that depend on who looks at it. A harbour office wants the
	// wind, the tide and whether a boat can go; a club the swell, the wind and the tide; a shop the four verdicts, the tide and the sky.
	let { screen, preset, lang, qr }: { screen: TvScreen; preset: TvPreset; lang: Lang; qr: Qr | null } =
		$props();
	const boat = $derived(screen.activities.find((a) => a.id === 'boat'));
</script>

<div class="tv-cols">
	{#if preset === 'port'}
		<div class="tv-col"><WindTile wind={screen.wind} {lang} /></div>
		<div class="tv-col tv-w115"><TideTile tide={screen.tide} {lang} /></div>
		<div class="tv-col tv-stack">
			<div class="tv-card-slot tv-w13"><VerdictTile activity={boat} {lang} /></div>
			<div class="tv-card-slot"><SkyTile sky={screen.sky} {lang} compact /></div>
		</div>
	{:else if preset === 'club'}
		<div class="tv-col"><SwellTile swell={screen.swell} {lang} /></div>
		<div class="tv-col"><WindTile wind={screen.wind} {lang} /></div>
		<div class="tv-col tv-w105"><TideTile tide={screen.tide} {lang} /></div>
	{:else}
		<div class="tv-col"><ConditionsTile activities={screen.activities} {lang} /></div>
		<div class="tv-col"><TideTile tide={screen.tide} {lang} /></div>
		<div class="tv-col tv-stack">
			<div class="tv-card-slot"><SkyTile sky={screen.sky} {lang} /></div>
			<div class="tv-card-slot tv-w09"><QrTile {qr} {lang} /></div>
		</div>
	{/if}
</div>
{#if preset !== 'shop'}<Corner {qr} {lang} />{/if}
