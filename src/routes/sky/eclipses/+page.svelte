<script lang="ts">
	// Solar eclipses: NASA's list of the next ten years, the map of the one chosen (drawn by the API from NASA's
	// elements) and, for a place chosen in the browser, what it will see: when, how much, for how long, the disc.
	import { onMount, untrack } from 'svelte';
	import Credits from '#lib/components/Credits.svelte';
	import EclipseDisc from '#lib/components/EclipseDisc.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import {
		clock,
		contactName,
		duration,
		eclipseDate,
		eclipseSentences,
		eclipseText,
		type Eclipse
	} from '#lib/eclipse.js';
	import type { Box } from '#lib/geo.js';
	import { parsePlace, type Place } from '#lib/near.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const chosen = $derived(data.chosen);
	const CHECK_URL = 'https://github.com/Axellum/vigie-api/blob/main/docs/measurements/eclipse-2027-08-02.md';

	let place = $state<Place | null>(null);
	let placeName = $state<string | null>(null);
	let locate = $state<'idle' | 'busy' | 'denied'>('idle');
	let timeZone = $state('UTC');
	const mapPlace = $derived(place ? { ...place, radiusKm: null } : null);
	const hash = $derived(place ? `#${place.lat},${place.lon}` : '');

	// The place given in the address (`#lat,lon`), at load and when the address changes.
	function fromAddress() {
		const fromHash = parsePlace(location.hash);
		if (fromHash) place = { lat: fromHash.lat, lon: fromHash.lon };
	}

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		fromAddress();
		addEventListener('hashchange', fromAddress);
		return () => removeEventListener('hashchange', fromAddress);
	});

	function choose(next: Place, name: string | null = null) {
		place = { lat: Math.round(next.lat * 1000) / 1000, lon: Math.round(next.lon * 1000) / 1000 };
		placeName = name;
		history.replaceState(
			history.state,
			'',
			`${location.pathname}${location.search}#${place.lat},${place.lon}`
		);
	}

	function locateMe() {
		if (!('geolocation' in navigator)) return;
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locate = 'idle';
				choose({ lat: p.coords.latitude, lon: p.coords.longitude });
			},
			() => (locate = 'denied'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	// --- the eclipse seen from the place ------------------------------------------------------------------------
	let seen = $state<{ key: string; status: 'loading' | 'ok' | 'error' | 'budget'; value?: Eclipse } | null>(
		null
	);

	async function load(key: string, id: string, at: Place) {
		seen = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/eclipse.json?date=${id}&lat=${at.lat}&lon=${at.lon}`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (seen?.key === key) seen = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = (await response.json()) as Eclipse;
			if (seen?.key === key) seen = { key, status: 'ok', value };
		} catch {
			if (seen?.key === key) seen = { key, status: 'error' };
		}
	}

	$effect(() => {
		const at = place;
		const id = chosen?.id;
		if (!at || !id) return;
		const key = `${id}:${at.lat},${at.lon}`;
		untrack(() => {
			if (seen?.key !== key) void load(key, id, at);
		});
	});
	const here = $derived(seen?.status === 'ok' ? (seen.value ?? null) : null);

	// Around the place once there is one; else around the greatest eclipse.
	const frame = $derived.by((): Box | null => {
		if (place)
			return [place.lon - 18, Math.max(-85, place.lat - 11), place.lon + 18, Math.min(85, place.lat + 11)];
		if (chosen?.greatestLat == null || chosen.greatestLon == null) return null;
		const { greatestLat: lat, greatestLon: lon } = chosen;
		return [lon - 60, Math.max(-85, lat - 35), lon + 60, Math.min(85, lat + 35)];
	});

	// The coming ones (the API's list starts with this year).
	const coming = $derived(data.eclipses.filter((e) => e.greatest > data.now - 6 * 3600));

	const longest = (e: Eclipse) =>
		e.centralDuration != null && e.kind !== 'partial'
			? eclipseText(lang, `longest.${e.kind}`, { d: duration(lang, e.centralDuration) })
			: null;
</script>

<Seo title={eclipseText(lang, 'page')} description={eclipseText(lang, 'pageIntro')} />

<div class="page">
	<header class="intro">
		<p class="small"><a href="/sky">← {lang === 'fr' ? 'Le ciel' : 'The sky'}</a></p>
		<h1>{eclipseText(lang, 'page')}</h1>
		<p class="muted">{eclipseText(lang, 'pageIntro')}</p>
		<p class="note">{eclipseText(lang, 'safety')}</p>
	</header>

	{#if coming.length}
		<section class="block">
			<h2>{eclipseText(lang, 'list')}</h2>
			<ul class="eclipses">
				{#each coming as e (e.id)}
					<li>
						<a
							href="?date={e.id}{hash}"
							aria-current={e.id === chosen?.id ? 'true' : undefined}
							data-sveltekit-noscroll
						>
							<strong>{eclipseDate(lang, e.id)}</strong>
							<span>{eclipseText(lang, `kind.${e.kind}`)}</span>
							{#if longest(e)}<span class="muted small">{longest(e)}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="note">{eclipseText(lang, 'unavailable')}</p>
	{/if}

	{#if chosen}
		<section class="block">
			<h2>{eclipseDate(lang, chosen.id)} · {eclipseText(lang, `kind.${chosen.kind}`)}</h2>
			{#if longest(chosen)}<p>{longest(chosen)}</p>{/if}
			<div class="map">
				<MapView
					{lang}
					eclipse={data.map?.features ?? null}
					{frame}
					globe
					place={mapPlace}
					onpick={(p) => choose(p)}
					label={eclipseText(lang, 'map')}
				/>
			</div>
			<p class="muted small">{eclipseText(lang, 'mapNote')} {eclipseText(lang, 'mapPick')}</p>
		</section>

		<section class="card pick">
			<h2>{eclipseText(lang, 'here')}</h2>
			<div class="row">
				<PlaceSearch {lang} id="eclipse-place" onpick={(p, label) => choose(p, label)} />
				<button type="button" onclick={locateMe} disabled={locate === 'busy'}
					>{eclipseText(lang, 'myPosition')}</button
				>
			</div>
			{#if locate === 'denied'}<p class="muted small">{eclipseText(lang, 'positionDenied')}</p>{/if}
			{#if placeName}<p class="muted small">{placeName}</p>{/if}

			{#if !place}
				<p class="muted">{eclipseText(lang, 'pickPlace')}</p>
			{:else if seen?.status === 'loading'}
				<p class="muted">{eclipseText(lang, 'loading')}</p>
			{:else if seen?.status === 'error' || seen?.status === 'budget'}
				<p class="note">{eclipseText(lang, 'failed')}</p>
			{:else if here?.here}
				{@const h = here.here}
				{#each eclipseSentences(lang, here) as sentence, i (i)}
					<p class={i === 0 ? 'sentence' : ''}>
						{i === 0 ? '' : ''}{#if i === 0}<strong>{sentence}</strong>{:else}{sentence}{/if}
					</p>
				{/each}
				{#if h.kind !== 'none' && h.visible}
					<table>
						<tbody>
							{#each h.contacts as c (c.name)}
								<tr>
									<th scope="row">{contactName(lang, c.name, h.kind)}</th>
									<td class="data">{clock(lang, c.time, true)}</td>
									<td class="muted small"
										>{c.sunUp
											? eclipseText(lang, 'sunAt', { alt: Math.round(c.sunAltitude) })
											: eclipseText(lang, 'sunDown')}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="muted small">{eclipseText(lang, 'timesNote', { tz: timeZone })}</p>
					{#if h.clouds}
						<p>
							{h.clouds.cover == null
								? eclipseText(lang, 'cloudsUnknown')
								: eclipseText(lang, 'clouds', { pct: `${Math.round(h.clouds.cover)} %` })}
						</p>
					{:else if h.cloudsNote && !h.cloudsNote.includes('past')}
						<p class="muted small">{eclipseText(lang, 'cloudsLater')}</p>
					{/if}
					{#if h.frames?.length}
						<h3>{eclipseText(lang, 'disc')}</h3>
						<EclipseDisc {lang} frames={h.frames} />
					{/if}
				{/if}
				<p class="muted small">
					{eclipseText(lang, 'computed')} <a href={CHECK_URL} rel="noopener">{eclipseText(lang, 'check')}</a>.
				</p>
			{/if}
		</section>
	{/if}

	<Credits
		{lang}
		credits={[data.attribution, data.map?.attribution, place ? (here?.attribution ?? null) : null]}
	/>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.block h2,
	.pick h2 {
		margin: 0 0 8px;
	}
	.eclipses {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 8px;
	}
	.eclipses a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
	}
	.eclipses a[aria-current='true'] {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.map {
		height: min(60vh, 460px);
		min-height: 280px;
		border-radius: var(--radius);
		overflow: hidden;
	}
	.pick {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	table {
		border-collapse: collapse;
		max-width: 100%;
	}
	th,
	td {
		text-align: left;
		padding: 4px 12px 4px 0;
		font-weight: normal;
	}
	h3 {
		margin: 8px 0 0;
		font-size: 16px;
	}
</style>
