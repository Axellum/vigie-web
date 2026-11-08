<script lang="ts">
	// "Should you go?" for every spot: the activity (surf, kite, boat, shore fishing) in the address, kept in this browser for the
	// next visit; the answer in one sentence; the spots around a place, the best verdict first, then every other; the map, folded.
	// The verdicts are the API's, rules of Vigie; what it did not give is left out. Not for safety.
	import { onMount } from 'svelte';
	import type { FeatureCollection } from 'geojson';
	import { goto } from '$app/navigation';
	import { ACTIVITY_IDS, activityText, type ActivityId, type Verdict } from '#lib/activities.js';
	import Credits from '#lib/components/Credits.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { readFollowed } from '#lib/followed.js';
	import type { Box } from '#lib/geo.js';
	import { answerText } from '#lib/sea/answer.js';
	import { DEFAULT_CHOICE, readChoice, updateChoice, type SeaChoice } from '#lib/sea/choice.js';
	import { answerOf, NEAR_KM, rankSpots, SLUGS } from '#lib/sea/overview.js';
	import SeaSettings from '#lib/sea/SeaSettings.svelte';
	import SeaSpotRow from '#lib/sea/SeaSpotRow.svelte';
	import { seaText } from '#lib/sea/text.js';
	import { windRangeText } from '#lib/sea/units.js';
	import { dayLabel, hourLabel } from '#lib/surf.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const overview = $derived(data.overview);

	// What this browser chose, read once the page is shown: the page the server wrote is the same for everybody.
	let choice = $state<SeaChoice>(DEFAULT_CHOICE);
	let mounted = $state(false);
	let me = $state<{ lat: number; lon: number; name: string | null } | null>(null);
	let locating = $state<'idle' | 'busy' | 'failed'>('idle');
	let mapOpen = $state(false);

	const active = $derived<ActivityId>(data.activity ?? choice.activity ?? 'surf');
	const hrefOf = (id: ActivityId): string =>
		`/sea/${SLUGS[id]}${id === 'kite' && choice.wind ? `?min=${choice.wind.min}&max=${choice.wind.max}` : ''}`;

	onMount(() => {
		choice = readChoice();
		const first = readFollowed()[0];
		if (first) me = { lat: first.lat, lon: first.lon, name: first.name };
		mounted = true;
		// The bare address shows the activity chosen last; the kite shows the range chosen last.
		if (!data.activity && choice.activity) {
			void goto(hrefOf(choice.activity), { replace: true, reset: false });
		} else if (data.activity === 'kite' && choice.wind && !data.asked) {
			void goto(hrefOf('kite'), { replace: true, reset: false });
		}
	});

	function choose(id: ActivityId) {
		choice = updateChoice({ activity: id });
	}
	function change(change: Partial<SeaChoice>) {
		choice = updateChoice(change);
	}
	function locate() {
		if (!('geolocation' in navigator)) {
			locating = 'failed';
			return;
		}
		locating = 'busy';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = 'idle';
				me = { lat: p.coords.latitude, lon: p.coords.longitude, name: null };
			},
			() => (locating = 'failed'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	const rows = $derived(overview ? rankSpots(overview.spots, active, me) : []);
	const near = $derived(me ? rows.filter((r) => r.km != null && r.km <= NEAR_KM) : rows);
	const far = $derived(me ? rows.filter((r) => r.km == null || r.km > NEAR_KM) : []);
	const sentence = $derived(answerText(lang, answerOf(rows, me), me != null));

	// Each activity's best verdict in the pills: among the spots near the place, else among all of them.
	const bestOf = (id: ActivityId): Verdict | null => {
		const list = overview ? rankSpots(overview.spots, id, me) : [];
		const pool = me ? list.filter((r) => r.km != null && r.km <= NEAR_KM) : list;
		return pool[0]?.activity.verdict ?? null;
	};
	const glyph = (v: Verdict | null) =>
		v === 'good' ? '✓' : v === 'possible' ? '~' : v === 'poor' ? '✕' : '';
	const word = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');

	// The map: a dot per spot, in the blue ramp of the surf map (dark: good), named in the legend.
	const BAND: Record<Verdict, number> = { good: 3, possible: 2, poor: 0 };
	const features = $derived<FeatureCollection>({
		type: 'FeatureCollection',
		features: rows.map((r) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [r.spot.lon, r.spot.lat] },
			properties: { id: r.spot.id, name: r.spot.name, q: r.activity.verdict ? BAND[r.activity.verdict] : -1 }
		}))
	});
	const frame = $derived.by((): Box | null => {
		if (!rows.length) return null;
		const lats = rows.map((r) => r.spot.lat);
		const lons = rows.map((r) => r.spot.lon);
		return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
	});

	const name = $derived(activityText(lang, `activity.${active}`));
	const pageTitle = $derived(data.activity ? `${name} · ${t('title')}` : `${t('page')} · ${t('title')}`);
	const description = $derived(data.activity ? t(`meta.${data.activity}`) : t('intro'));
	const rangeSaid = $derived(
		active === 'kite' && overview?.windRange ? windRangeText(lang, overview.windRange, choice.unit) : null
	);
</script>

<Seo title={pageTitle} {description} />

<div class="page">
	<header class="intro">
		<h1>{t('title')}</h1>
		<p class="muted">{t('intro')}</p>
	</header>

	<nav class="pills" aria-label={t('myActivity')}>
		<ul>
			{#each ACTIVITY_IDS as id (id)}
				{@const best = bestOf(id)}
				<li>
					<a
						href={hrefOf(id)}
						aria-current={id === active ? 'page' : undefined}
						data-sveltekit-reset="false"
						onclick={() => choose(id)}
						>{activityText(lang, `activity.${id}`)}{#if best}
							<span class="hint v-{best}" aria-hidden="true">{glyph(best)}</span><span
								class="visually-hidden"
							>
								({word(best).toLowerCase()})</span
							>{/if}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	{#if overview}
		<section class="answer" aria-live="polite" aria-label={name}>
			<h2 class="visually-hidden">{name}</h2>
			<p class="sentence">{sentence}</p>
			{#if rangeSaid}<p class="muted small">{t('windCurrent', { range: rangeSaid })}</p>{/if}
			{#if data.rangeDenied}<p class="note small">{t('windDenied')}</p>{/if}
			{#if overview.stale}<p class="note small">{t('stale')}</p>{/if}
		</section>

		<section class="where" aria-label={t('place', { place: '' })}>
			{#if me}
				<p class="small">
					<b>{t('place', { place: me.name ?? t('myPosition') })}</b> ·
					<button type="button" class="link" onclick={() => (me = null)}>{t('stopLocate')}</button>
				</p>
			{:else}
				<p class="muted small">{t('nobody')}</p>
			{/if}
			<p>
				<button type="button" class="btn quiet" onclick={locate} disabled={locating === 'busy'}
					>{locating === 'busy' ? t('locating') : t('locate')}</button
				>
				{#if locating === 'failed'}<span class="muted small">{t('locateFailed')}</span>{/if}
			</p>
			<p class="muted small">{t('locateNote')}</p>
		</section>

		<section class="block">
			<h2>{t('spots')}</h2>
			<p class="muted small">{t('legend')}</p>
			<ul class="spots">
				{#each near as row (row.spot.id)}<li><SeaSpotRow {lang} {row} /></li>{/each}
			</ul>
			{#if far.length}
				<details class="far">
					<summary>{t('spotsFar', { count: far.length })}</summary>
					<ul class="spots">
						{#each far as row (row.spot.id)}<li><SeaSpotRow {lang} {row} /></li>{/each}
					</ul>
				</details>
			{/if}
		</section>

		<details class="map" bind:open={mapOpen}>
			<summary>{t('map')}</summary>
			{#if mapOpen}
				<div class="mapbox">
					<MapView
						{lang}
						spots={features}
						{frame}
						label={t('map')}
						onselect={(s) => {
							if (s.kind === 'spot') void goto(`/surf/${s.id}`);
						}}
					/>
				</div>
				<ul class="legend">
					{#each ['good', 'possible', 'poor'] as const as v (v)}
						<li><span class="swatch surf-q{BAND[v]}"></span>{word(v)}</li>
					{/each}
					<li><span class="swatch surf-qn"></span>{word(null)}</li>
				</ul>
				<p class="muted small">{t('mapNote')}</p>
			{/if}
		</details>

		{#if mounted}
			<SeaSettings {lang} {choice} applied={overview.windRange} onchange={change} />
		{/if}

		<p class="muted small"><a href="/surf">{t('surfPage')}</a></p>
		<p class="muted small">
			{t('updated', {
				time: `${dayLabel(lang, overview.generated)}, ${hourLabel(lang, overview.generated)}`
			})}
		</p>
		{#if overview.limits}<p class="muted small" lang="en">{overview.limits}</p>{/if}
		{#if overview.disclaimer}<p class="note small" lang="en">{overview.disclaimer}</p>{/if}
	{:else}
		<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
	{/if}

	<Credits {lang} credits={[overview?.attribution]} />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.pills ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pills a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border: 1px solid var(--line);
		border-radius: 20px;
		color: inherit;
		text-decoration: none;
		font-weight: 600;
		background: var(--surface);
	}
	.pills a:hover {
		border-color: var(--accent);
	}
	.pills a[aria-current='page'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--surface);
	}
	.hint {
		display: inline-block;
		min-width: 1.4em;
		text-align: center;
		border-radius: 10px;
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}
	.v-good {
		background: var(--sev-green);
		color: var(--on-sev);
	}
	.v-possible {
		background: var(--sev-yellow);
		color: var(--on-yellow);
	}
	.v-poor {
		background: var(--sev-red);
		color: var(--on-sev);
	}
	.sentence {
		margin: 0;
		font-size: 19px;
		font-weight: 600;
		line-height: 1.35;
	}
	.answer p {
		margin: 4px 0;
	}
	.where p {
		margin: 4px 0;
	}
	.link {
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
	}
	.block h2 {
		margin: 0 0 4px;
	}
	.spots {
		list-style: none;
		padding: 0;
		margin: 8px 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 8px;
	}
	.far summary,
	.map summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--muted);
	}
	.mapbox {
		height: min(60vh, 480px);
		border-radius: var(--radius);
		overflow: hidden;
		margin: 8px 0;
	}
	.legend {
		list-style: none;
		margin: 0 0 6px;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		font-size: 14px;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: none;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 25%, transparent);
	}
</style>
