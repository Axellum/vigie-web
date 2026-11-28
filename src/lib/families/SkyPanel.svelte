<script lang="ts">
	// The sky family in the side panel of the home map: the aurora tonight for the place of "here" or a place touched on the map
	// (the API's estimate, `NearSky`, as on the sky page), the magnetic activity of the coming day, and the way to the sky page
	// (the Kp chart, the solar wind) and to the eclipses. NOAA's oval is on the map.
	import Credits from '#lib/components/Credits.svelte';
	import NearSky from '#lib/components/NearSky.svelte';
	import { eclipseText } from '#lib/eclipse.js';
	import type { SkyFamily } from '#lib/families/skyFamily.svelte.js';
	import { dateTime } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import { snapToGrid, type Place } from '#lib/near.js';
	import { activityWords, sky as skyText } from '#lib/sky.js';

	let { lang, sky, place, name }: { lang: Lang; sky: SkyFamily; place: Place | null; name: string | null } =
		$props();

	const tr = $derived(translator(lang));
	const cell = $derived(place ? snapToGrid(place) : null);
	const activity = $derived(sky.aurora ? activityWords(lang, sky.aurora.kpMax24h) : null);
	let placeCredit = $state<string | null>(null);
</script>

<section class="sky" aria-labelledby="sky-title">
	<p class="eyebrow">{tr('frame.family.sky')} · {skyText(lang, 'tonight')}</p>
	<h2 id="sky-title">{name ?? skyText(lang, 'auroraTitle')}</h2>
	<!-- With a place, NearSky says the activity itself. -->
	{#if activity && !cell}
		<p class="said">{activity} <span class="muted">{skyText(lang, 'activityNext')}</span></p>
	{/if}
	{#if cell}
		<NearSky {lang} {cell} bare onattribution={(a) => (placeCredit = a)} />
	{:else}
		<p class="muted">{tr('skyFamily.pick')}</p>
	{/if}
	{#if sky.status === 'loading'}
		<p class="muted small">{tr('skyFamily.loading')}</p>
	{:else if sky.oval?.forecast}
		<p class="muted small">{skyText(lang, 'layerNote', { time: dateTime(lang, sky.oval.forecast) })}</p>
	{:else if sky.status === 'failed' || (sky.status === 'ok' && !sky.oval)}
		<p class="note small">{skyText(lang, 'unavailable')}</p>
	{/if}
	<p class="links small">
		<a href="/sky">{tr('skyFamily.page')}</a>
		<a href="/sky/eclipses">{eclipseText(lang, 'link')}</a>
	</p>
	<Credits {lang} credits={[sky.aurora?.attribution, sky.oval?.attribution, cell ? placeCredit : null]} />
</section>

<style>
	.sky {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h2 {
		font: 700 26px/1.05 var(--font-display);
	}
	.said {
		font-weight: 600;
		line-height: 1.35;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
</style>
