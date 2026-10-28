<script lang="ts">
	// A new zone: a place and a radius (search, click, or the address of the page, as on "near me"), a drawn
	// polygon, a country, or an official area (from its page). The position stays in the browser until the
	// zone is saved.
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import MapView from '#lib/components/MapView.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import { BOXES, countryBox, type Box } from '#lib/geo.js';
	import { countryName, translator, type Key } from '#lib/i18n.js';
	import { circleBox, parsePlace, type Place } from '#lib/near.js';
	import { asProfile, PROFILES } from '#lib/profiles.js';
	import { ALERT_KINDS, MIN_LEVELS, ZONE_RADII_KM } from '#lib/zones.js';

	let { data, form } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	type Mode = 'circle' | 'polygon' | 'country' | 'area';
	// svelte-ignore state_referenced_locally
	let mode = $state<Mode>(data.area && data.country ? 'area' : data.country ? 'country' : 'circle');
	let place = $state<Place | null>(null);
	let radiusKm = $state(25);
	/** The profile chosen on "near me", when the zone comes from there; '' for none. */
	let profile = $state('');
	let corners = $state<[number, number][]>([]);
	// svelte-ignore state_referenced_locally
	let country = $state(data.country ?? '');
	let name = $state('');
	let named = false;

	const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
	const fmt = (v: number) => v.toFixed(3);

	function setName(value: string) {
		if (!named) name = value.slice(0, 60);
	}

	onMount(() => {
		const read = parsePlace(location.hash);
		if (read) {
			mode = 'circle';
			place = { lat: read.lat, lon: read.lon };
			if (read.radiusKm && ZONE_RADII_KM.includes(read.radiusKm)) radiusKm = read.radiusKm;
			profile = asProfile(read.profile) ?? '';
		}
		if (mode === 'area' && data.area && data.country)
			setName(`${data.area} (${countryName(lang, data.country)})`);
		else if (mode === 'country' && data.country) setName(countryName(lang, data.country));
		else if (place) setName(`${fmt(place.lat)}, ${fmt(place.lon)}`);
	});

	function pick(p: Place, label?: string) {
		if (mode === 'polygon') {
			corners = [...corners, [round3(p.lon), round3(p.lat)]];
			return;
		}
		if (mode !== 'circle') return;
		place = { lat: round3(p.lat), lon: round3(p.lon) };
		setName(label ?? `${fmt(place.lat)}, ${fmt(place.lon)}`);
	}

	const countries = $derived(
		Object.keys(BOXES)
			.map((cc) => ({ cc, name: countryName(lang, cc), served: data.served.includes(cc) }))
			.sort((a, b) => a.name.localeCompare(b.name, lang))
	);

	const frame = $derived.by((): Box | null => {
		if (mode === 'circle' && place) return circleBox(place, radiusKm);
		if ((mode === 'country' || mode === 'area') && country) return countryBox(country);
		return null;
	});

	const error = $derived.by((): Key | null => {
		const code = (form as { error?: string } | null)?.error;
		return code ? (`zones.err.${code}` as Key) : null;
	});
	const ready = $derived(
		(mode === 'circle' && place !== null) ||
			(mode === 'polygon' && corners.length >= 3) ||
			((mode === 'country' || mode === 'area') && country !== '')
	);
</script>

<svelte:head>
	<title>Vigie · {tr('zones.newTitle')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/account">{tr('account.title')}</a></p>
		<h1>{tr('zones.newTitle')}</h1>
		<p class="muted">{tr('zones.intro')}</p>
	</header>

	{#if data.count >= data.max}
		<p class="note">{tr('zones.full', { n: data.max })}</p>
	{:else}
		<div class="modes chips" role="group" aria-label={tr('zones.newTitle')}>
			{#each ['circle', 'polygon', 'country', ...(data.area ? ['area'] : [])] as m (m)}
				<button type="button" class="chip" aria-pressed={mode === m} onclick={() => (mode = m as Mode)}>
					{tr(`zones.mode.${m}` as Key)}
				</button>
			{/each}
		</div>

		<div class="layout">
			<div class="side stack">
				{#if mode === 'circle'}
					<PlaceSearch {lang} id="zone-search" onpick={(p, label) => pick(p, label)} />
					<p class="muted small">
						{place ? tr('zones.picked', { lat: fmt(place.lat), lon: fmt(place.lon) }) : tr('zones.pickHint')}
					</p>
					<label class="form-field">
						<span>{tr('zones.radius')}</span>
						<select class="input" bind:value={radiusKm}>
							{#each ZONE_RADII_KM as r (r)}<option value={r}>{r} km</option>{/each}
						</select>
					</label>
				{:else if mode === 'polygon'}
					<p class="muted small">{tr('zones.drawHint')}</p>
					<p>{tr('zones.corners', { n: corners.length })}</p>
					<div class="btn-row">
						<button
							type="button"
							class="btn quiet"
							disabled={!corners.length}
							onclick={() => (corners = corners.slice(0, -1))}>{tr('zones.undo')}</button
						>
						<button type="button" class="btn quiet" disabled={!corners.length} onclick={() => (corners = [])}
							>{tr('zones.clear')}</button
						>
					</div>
				{:else if mode === 'country'}
					<label class="form-field">
						<span>{tr('zones.country')}</span>
						<select
							class="input"
							bind:value={country}
							onchange={() => country && setName(countryName(lang, country))}
						>
							<option value=""></option>
							{#each countries as c (c.cc)}
								<option value={c.cc}>{c.name}{c.served ? ` · ${tr('zones.served')}` : ''}</option>
							{/each}
						</select>
					</label>
				{:else if mode === 'area' && data.area && data.country}
					<p>{tr('zones.describe.area', { area: data.area, country: countryName(lang, data.country) })}</p>
				{/if}

				<!-- Sent without reloading the page, so that a refused zone keeps what was drawn. -->
				<form method="POST" class="form" use:enhance>
					<input type="hidden" name="kind" value={mode} />
					{#if mode === 'circle' && place}
						<input type="hidden" name="lat" value={place.lat} />
						<input type="hidden" name="lon" value={place.lon} />
						<input type="hidden" name="radiusKm" value={radiusKm} />
					{:else if mode === 'polygon'}
						<input type="hidden" name="corners" value={JSON.stringify(corners)} />
					{:else if mode === 'country' || mode === 'area'}
						<input type="hidden" name="country" value={country} />
						{#if mode === 'area'}<input type="hidden" name="area" value={data.area} />{/if}
					{/if}
					<label class="form-field">
						<span>{tr('zones.name')}</span>
						<input
							class="input"
							name="name"
							required
							maxlength="60"
							bind:value={name}
							oninput={() => (named = true)}
						/>
					</label>
					{#if mode === 'circle'}
						<label class="form-field">
							<span>{tr('zones.profile')}</span>
							<select class="input" name="profile" bind:value={profile}>
								<option value="">{tr('profile.none')}</option>
								{#each PROFILES as p (p)}<option value={p}>{tr(`profile.${p}` as Key)}</option>{/each}
							</select>
						</label>
					{/if}
					<label class="form-field">
						<span>{tr('zones.minLevel')}</span>
						<select class="input" name="minLevel">
							{#each MIN_LEVELS as l (l)}<option value={l}>{tr(`zones.level.${l}` as Key)}</option>{/each}
						</select>
					</label>
					<fieldset class="kinds">
						<legend>{tr('zones.kinds')}</legend>
						{#each ALERT_KINDS as k (k)}
							<label
								><input type="checkbox" name="kinds" value={k} checked={k !== 'SOLAR_STORM'} />
								{tr(`cat.${k}` as Key)}</label
							>
						{/each}
					</fieldset>
					<button type="submit" class="btn" disabled={!ready}>{tr('zones.save')}</button>
					{#if error}<p class="error" role="alert">{tr(error, { n: data.max })}</p>{/if}
				</form>
			</div>
			<div class="map">
				<MapView
					{lang}
					{frame}
					place={mode === 'circle' && place ? { ...place, radiusKm } : null}
					drawing={mode === 'polygon' ? corners : null}
					onpick={(p) => pick(p)}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 70ch;
	}
	.layout {
		display: grid;
		gap: 16px;
	}
	@media (min-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
			align-items: start;
		}
	}
	.map {
		height: 460px;
		min-width: 0;
	}
	.kinds {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 12px;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 4px 12px;
		width: 100%;
		font-size: 14px;
	}
	.kinds label {
		display: flex;
		gap: 6px;
		align-items: center;
	}
</style>
