<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	// "Near me": a place in one sentence, then its cards (official warnings, hazards around, weather, sea, tide,
	// sky, air), in the order of the visitor's profile. The place is chosen in the browser (position, search, click
	// on the map, the address of the page, or a followed place) and the matching is done here, on the data every
	// visitor loads; only a position rounded to the weather grid leaves the browser. Followed places are kept in
	// this browser only; the places of an account (its zones that are a point and a radius) come from the
	// account, asked for by the browser, so that the page stays the same for everybody.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Credits from '#lib/components/Credits.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import PlaceCard from '#lib/components/PlaceCard.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import {
		follow,
		MAX_FOLLOWED,
		readFollowed,
		sameSpot,
		unfollow,
		writeFollowed,
		type AccountPlace,
		type FollowedPlace
	} from '#lib/followed.js';
	import { translator, type Key } from '#lib/i18n.js';
	import { parsePlace, placeHash, type Place } from '#lib/near.js';
	import { placeFormat } from '#lib/placeFormat.js';
	import { PlaceState } from '#lib/placeState.svelte.js';
	import { asProfile, PROFILES, type Profile } from '#lib/profiles.js';
	import { ZONE_RADII_KM } from '#lib/zones.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	// The radii of the zones an account can watch, so that a zone opens here with its own radius.
	const RADII = ZONE_RADII_KM;

	let place = $state<Place | null>(null);
	let radiusKm = $state(300);
	let profile = $state<Profile | null>(null);
	let locate = $state<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
	let followed = $state<FollowedPlace[]>([]);
	let followNote = $state<'full' | 'refused' | null>(null);
	/** The places of the account signed in; none for a visitor without one. */
	let account = $state<AccountPlace[]>([]);
	let accountNote = $state<'saveFailed' | null>(null);
	// The time of the page until the first tick in the browser, so that "until" stays right on a long visit.
	let tick = $state<number | null>(null);
	const now = $derived(tick ?? data.now);

	const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

	/** The name of a place found by the search or followed by name; a click or a position has none. */
	let placeName = $state<string | null>(null);

	function address() {
		if (place) goto(placeHash(place, radiusKm, profile), { shallow: true, replace: true });
	}

	/** A place followed in this browser, else one of the account. */
	const knownAt = (at: Place) =>
		followed.find((p) => sameSpot(p, at)) ?? account.find((a) => sameSpot(a, at));

	function choose(next: Place, name: string | null = null) {
		place = { lat: round3(next.lat), lon: round3(next.lon) };
		const known = knownAt(place);
		placeName = name ?? known?.name ?? null;
		if (known) {
			radiusKm = known.radiusKm;
			profile = known.profile;
		}
		address();
	}

	function pickFollowed(f: FollowedPlace | AccountPlace) {
		place = { lat: f.lat, lon: f.lon };
		placeName = f.name;
		radiusKm = f.radiusKm;
		profile = f.profile;
		address();
	}

	/** A followed place keeps the radius and the profile chosen for it. */
	function keepSettings() {
		const at = place;
		const known = at ? followed.find((p) => sameSpot(p, at)) : undefined;
		if (known) save(follow(followed, { ...known, radiusKm, profile }));
	}

	function setRadius(km: number) {
		radiusKm = km;
		address();
		keepSettings();
	}

	function setProfile(next: Profile | null) {
		profile = next;
		address();
		keepSettings();
		// A place of the account keeps its profile there; its radius is the zone's, changed in the account only.
		if (inAccount && inAccount.profile !== next) void saveAccountProfile(inAccount, next);
	}

	const inAccount = $derived(place ? (account.find((a) => sameSpot(a, place!)) ?? null) : null);

	async function loadAccount() {
		try {
			const response = await fetch('/account/places.json');
			if (!response.ok) return;
			account = ((await response.json()) as { places: AccountPlace[] }).places;
			// A place opened by its address takes the name the account gives it.
			if (place && !placeName) placeName = knownAt(place)?.name ?? null;
		} catch {
			// Without the account's places, the page works as for any visitor.
		}
	}

	async function saveAccountProfile(at: AccountPlace, next: Profile | null) {
		accountNote = null;
		try {
			const response = await fetch('/account/places.json', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: at.id, profile: next })
			});
			if (!response.ok) throw new Error(String(response.status));
			account = account.map((a) => (a.id === at.id ? { ...a, profile: next } : a));
		} catch {
			accountNote = 'saveFailed';
		}
	}

	function save(list: FollowedPlace[]) {
		followed = list;
		followNote = writeFollowed(list) ? null : 'refused';
	}

	const isFollowed = $derived(!!place && followed.some((p) => sameSpot(p, place!)));

	function toggleFollow() {
		if (!place) return;
		if (isFollowed) save(unfollow(followed, place));
		else if (followed.length >= MAX_FOLLOWED) followNote = 'full';
		else save(follow(followed, { lat: place.lat, lon: place.lon, radiusKm, name: placeName, profile }));
	}

	function readHash() {
		const read = parsePlace(location.hash);
		if (!read) return;
		if (!place || place.lat !== read.lat || place.lon !== read.lon) placeName = knownAt(read)?.name ?? null;
		place = { lat: read.lat, lon: read.lon };
		if (read.radiusKm && RADII.includes(read.radiusKm)) radiusKm = read.radiusKm;
		profile = asProfile(read.profile);
	}

	function locateMe() {
		if (!('geolocation' in navigator)) {
			locate = 'unsupported';
			return;
		}
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				locate = 'idle';
				choose({ lat: position.coords.latitude, lon: position.coords.longitude });
			},
			() => (locate = 'denied'),
			{
				enableHighAccuracy: false,
				timeout: 15_000,
				maximumAge: 600_000
			}
		);
	}

	onMount(() => {
		followed = readFollowed();
		readHash();
		if (data.accounts) void loadAccount();
		window.addEventListener('hashchange', readHash);
		const clock = setInterval(() => (tick = Math.floor(Date.now() / 1000)), 60_000);
		tick = Math.floor(Date.now() / 1000);
		return () => {
			window.removeEventListener('hashchange', readHash);
			clearInterval(clock);
		};
	});

	// The place's own state: its warnings, hazards, weather, tide and surf spots, loaded as the place changes (the same
	// state "my page" makes for each of its places).
	const s = new PlaceState(() => ({
		place,
		radiusKm,
		profile,
		lang,
		now,
		hazards: data.hazards,
		hazardsAttribution: data.hazardsAttribution,
		served: data.served,
		uncovered: data.uncovered
	}));
	const { where } = $derived(placeFormat(lang));
</script>

<Seo title={tr('near.title')} description={tr('near.description')} />

<div class="page near">
	<header class="intro">
		<h1>{tr('near.title')}</h1>
		<p class="muted">{tr('near.privacy')}</p>
		{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	</header>

	{#snippet chip(f: FollowedPlace | AccountPlace)}
		<a
			class="chip"
			href={placeHash(f, f.radiusKm, f.profile)}
			aria-current={place && sameSpot(f, place) ? 'true' : undefined}
			onclick={(e) => {
				e.preventDefault();
				pickFollowed(f);
			}}>{f.name ?? where(f)}</a
		>
	{/snippet}
	{#if followed.length || account.length}
		<nav class="followed" aria-label={tr('near.followed')}>
			<span class="small muted">{tr('near.followed')}</span>
			{#if account.length}
				<span class="group small">{tr('near.inAccount')}</span>
				{#each account as a (a.id)}{@render chip(a)}{/each}
				{#if followed.length}<span class="group small">{tr('near.inBrowser')}</span>{/if}
			{/if}
			{#each followed as f (`${f.lat},${f.lon}`)}{@render chip(f)}{/each}
		</nav>
	{/if}

	<div class="tools">
		<div class="search"><PlaceSearch {lang} onpick={(p, label) => choose(p, label)} /></div>
		<button type="button" class="btn" onclick={locateMe} disabled={locate === 'busy'}>
			{locate === 'busy' ? tr('near.locating') : tr('near.locate')}
		</button>
		<label class="field">
			<span>{tr('near.radius')}</span>
			<select value={radiusKm} onchange={(e) => setRadius(Number(e.currentTarget.value))}>
				{#each RADII as r (r)}<option value={r}>{r} km</option>{/each}
			</select>
		</label>
	</div>
	{#if locate === 'denied'}
		<p class="note">{tr('near.denied')}</p>
	{:else if locate === 'unsupported'}
		<p class="note">{tr('near.unsupported')}</p>
	{/if}

	<div class="layout">
		<div class="main">
			{#if !place}
				<p class="card">{tr('near.choose')}</p>
			{:else}
				<div class="title">
					<h2>{placeName ?? where(place)}</h2>
					<label class="field">
						<span>{tr('profile.label')}</span>
						<select value={profile ?? ''} onchange={(e) => setProfile(asProfile(e.currentTarget.value))}>
							<option value="">{tr('profile.none')}</option>
							{#each PROFILES as p (p)}<option value={p}>{tr(`profile.${p}` as Key)}</option>{/each}
						</select>
					</label>
					<!-- A zone of the account is followed already: following it in the browser too would show it twice. -->
					{#if !inAccount || isFollowed}
						<button type="button" class="btn quiet" aria-pressed={isFollowed} onclick={toggleFollow}>
							{isFollowed ? tr('near.unfollow') : tr('near.follow')}
						</button>
					{/if}
				</div>
				{#if followNote === 'full'}
					<p class="note">{tr('near.followFull', { n: MAX_FOLLOWED })}</p>
				{:else if followNote === 'refused'}
					<p class="note">{tr('near.followRefused')}</p>
				{/if}
				{#if inAccount}
					<p class="muted small">
						{tr('near.accountHere')}
						<a href="/account#zones">{tr('near.manage')}</a>
					</p>
				{/if}
				{#if accountNote === 'saveFailed'}<p class="note">{tr('near.profileSaveFailed')}</p>{/if}

				{#if s.sentence.length}
					<div class="said">
						<p class="sentence">{s.sentence.join(' ')}</p>
						<p class="muted small">{tr('sentence.note')}</p>
					</div>
				{/if}

				<div class="cards">
					{#each s.order as name (name)}<PlaceCard state={s} {name} />{/each}
				</div>
			{/if}
		</div>

		<aside class="side">
			<div class="map">
				<MapView
					{lang}
					zones={s.zones}
					hazards={s.near.map((h) => h.hazard)}
					frame={s.frame}
					place={s.mapPlace}
					onpick={choose}
					label={tr('near.title')}
				/>
			</div>
			<p class="muted small">{tr('near.pickHint')}</p>
			{#if place}
				<section class="card about">
					<h3>{tr('profile.label')} : {profile ? tr(`profile.${profile}` as Key) : tr('profile.none')}</h3>
					<p class="small">{tr(`profile.about.${profile ?? 'none'}` as Key)}</p>
					<p class="muted small">{tr('profile.rule')}</p>
				</section>
				<p class="muted small">{tr('near.followedNote')}</p>
				{#if data.accounts && !inAccount}
					<p class="small">
						<a href="/account/zones/new{placeHash(place, radiusKm, profile)}" rel="nofollow"
							>{tr('zones.watchHere', { km: radiusKm })}</a
						>
					</p>
				{/if}
			{/if}
		</aside>
	</div>

	{#if place}
		<!-- The credits of what the page shows: the warnings found here, the hazards around, the weather, the tide. -->
		<Credits {lang} credits={s.credits} />
	{/if}
</div>

<style>
	/* Wider than the reading pages: the cards and the map side by side. */
	.page.near {
		max-width: 1240px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.followed {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.followed .group {
		font-weight: 600;
		margin-left: 4px;
	}
	.followed .chip[aria-current='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 14px;
		align-items: flex-end;
	}
	.tools .search {
		flex: 0 1 460px;
		min-width: 0;
	}
	.field {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
	.field select {
		font: inherit;
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
	}
	.layout {
		display: grid;
		gap: 20px;
		align-items: start;
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 360px;
		}
		.side {
			position: sticky;
			top: 12px;
		}
	}
	.main,
	.side {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.title {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 14px;
		align-items: center;
	}
	.title h2 {
		font-size: 28px;
		margin-right: auto;
		overflow-wrap: anywhere;
	}
	.said {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sentence {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: clamp(20px, 2.6vw, 27px);
		line-height: 1.2;
		text-wrap: pretty;
	}
	.cards {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
	}
	.cards > :global(:first-child) {
		grid-column: 1 / -1;
	}
	.map {
		height: 300px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.about {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.about h3 {
		font-size: 16px;
	}
</style>
