<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	// "Near me": a place in one sentence, then its cards (official warnings, hazards around, weather, sea, sky,
	// air), in the order of the visitor's profile. The place is chosen in the browser (position, search, click
	// on the map, the address of the page, or a followed place) and the matching is done here, on the data every
	// visitor loads; only a position rounded to the weather grid leaves the browser. Followed places are kept in
	// this browser only.
	import { onMount, untrack, type Snippet } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { Feature, FeatureCollection } from 'geojson';
	import { goto } from '$app/navigation';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import Credits from '#lib/components/Credits.svelte';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import NearCard from '#lib/components/NearCard.svelte';
	import NearSky from '#lib/components/NearSky.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import PointWeather from '#lib/components/PointWeather.svelte';
	import { pointCredits } from '#lib/credits.js';
	import {
		follow,
		MAX_FOLLOWED,
		readFollowed,
		sameSpot,
		unfollow,
		writeFollowed,
		type FollowedPlace
	} from '#lib/followed.js';
	import { number } from '#lib/format.js';
	import { countryName, tOr, translator, type Key } from '#lib/i18n.js';
	import { byLevelThenTime, LEVELS, maxLevel } from '#lib/levels.js';
	import {
		circleBox,
		countriesNear,
		countryAt,
		hazardsNear,
		parsePlace,
		placeHash,
		snapToGrid,
		warningsAt,
		type Borders,
		type Place
	} from '#lib/near.js';
	import { asProfile, cardOrder, PROFILES, wantsSea, type Card, type Profile } from '#lib/profiles.js';
	import { hazardRow, warningRow } from '#lib/rows.js';
	import { placeSentence, type OfficialState } from '#lib/sentence.js';
	import type { Level, PointWeather as Weather, WarningsData } from '#lib/types.js';
	import { compass, skyLabel } from '#lib/weather.js';
	import { ZONE_RADII_KM } from '#lib/zones.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	// The radii of the zones an account can watch, so that a zone opens here with its own radius.
	const RADII = ZONE_RADII_KM;

	let place = $state<Place | null>(null);
	let radiusKm = $state(300);
	let profile = $state<Profile | null>(null);
	/** The conditions at sea, asked on a click (the profiles that want the sea ask without one). */
	let marine = $state(false);
	let locate = $state<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
	let followed = $state<FollowedPlace[]>([]);
	let followNote = $state<'full' | 'refused' | null>(null);
	// The time of the page until the first tick in the browser, so that "until" stays right on a long visit.
	let tick = $state<number | null>(null);
	const now = $derived(tick ?? data.now);

	const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

	/** The name of a place found by the search or followed by name; a click or a position has none. */
	let placeName = $state<string | null>(null);

	function address() {
		if (place) goto(placeHash(place, radiusKm, profile), { shallow: true, replace: true });
	}

	function choose(next: Place, name: string | null = null) {
		place = { lat: round3(next.lat), lon: round3(next.lon) };
		const known = followed.find((p) => sameSpot(p, place!));
		placeName = name ?? known?.name ?? null;
		if (known) {
			radiusKm = known.radiusKm;
			profile = known.profile;
		}
		address();
	}

	function pickFollowed(f: FollowedPlace) {
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
		if (!place || place.lat !== read.lat || place.lon !== read.lon)
			placeName = followed.find((p) => sameSpot(p, read))?.name ?? null;
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
		window.addEventListener('hashchange', readHash);
		const clock = setInterval(() => (tick = Math.floor(Date.now() / 1000)), 60_000);
		tick = Math.floor(Date.now() / 1000);
		return () => {
			window.removeEventListener('hashchange', readHash);
			clearInterval(clock);
		};
	});

	// --- official warnings of the countries around the place -------------------------------------------
	type CountryState = { status: 'loading' | 'ok' | 'error'; data?: WarningsData };
	const countries = new SvelteMap<string, CountryState>();
	const nearCountries = $derived(place ? countriesNear(place, data.served) : []);

	async function loadCountry(cc: string) {
		const previous = countries.get(cc);
		if (previous && previous.status !== 'error') return;
		countries.set(cc, { status: 'loading' });
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (!response.ok) throw new Error(String(response.status));
			countries.set(cc, { status: 'ok', data: (await response.json()) as WarningsData });
		} catch {
			countries.set(cc, { status: 'error' });
		}
	}

	$effect(() => {
		const wanted = nearCountries;
		// The loads read and write the states: untracked, so that a new state does not start them again.
		untrack(() => {
			for (const cc of wanted) void loadCountry(cc);
		});
	});

	const results = $derived.by(() => {
		const out = new Map<string, ReturnType<typeof warningsAt>>();
		if (!place) return out;
		for (const cc of nearCountries) {
			const state = countries.get(cc);
			if (state?.data) out.set(cc, warningsAt(state.data, place));
		}
		return out;
	});
	const here = $derived(
		[...results.values()]
			.flatMap((r) => r.here)
			.sort((a, b) => byLevelThenTime(warningRow(a.warning), warningRow(b.warning)))
	);
	// The country the place is in, from simplified borders loaded with the first place (100 kB): undefined
	// while they load, null outside every covered country.
	let borders = $state<Borders | null>(null);
	$effect(() => {
		if (place && !borders)
			import('#lib/data/borders.json').then((m) => (borders = m.default as unknown as Borders));
	});
	const country = $derived(place && borders ? countryAt(borders, place) : undefined);
	// Why the API reads no source for that country, when it says (a known reason code only).
	const why = $derived(
		country ? (data.uncovered.find((u) => u.country === country && u.reasonCode) ?? null) : null
	);
	// Warnings without an area can only be said to concern the country the place is in.
	const unplaced = $derived(
		[...results.entries()]
			.filter(([cc, r]) => cc === country && r.unplaced.length > 0)
			.map(([cc, r]) => ({ cc, n: r.unplaced.length }))
	);
	const loading = $derived(nearCountries.filter((cc) => countries.get(cc)?.status === 'loading'));
	const failed = $derived(nearCountries.filter((cc) => countries.get(cc)?.status === 'error'));
	const official = $derived.by((): OfficialState => {
		if (
			nearCountries.length === 0 ||
			(here.length === 0 && (country === null || (country !== undefined && !data.served.includes(country))))
		)
			return 'nosource';
		if (here.length) return 'warnings';
		if (loading.length || country === undefined) return 'loading';
		if (failed.length) return 'failed';
		return unplaced.length ? 'unplaced' : 'none';
	});
	const credits = $derived([
		...new Set(
			[...results.entries()]
				.filter(([, r]) => r.here.length > 0)
				.flatMap(([cc]) => {
					const d = countries.get(cc)?.data;

					return d ? [...d.attributions, ...(d.disclaimer ? [d.disclaimer] : [])] : [];
				})
		)
	]);

	// --- hazards around ---------------------------------------------------------------------------------
	const near = $derived(place ? hazardsNear(data.hazards, place, radiusKm) : []);

	// --- weather of the grid point ---------------------------------------------------------------------
	let weather = $state<{
		key: string;
		status: 'loading' | 'ok' | 'error' | 'budget';
		value?: Weather & { stale?: boolean };
	} | null>(null);
	const cell = $derived(place ? snapToGrid(place) : null);
	const withSea = $derived(marine || wantsSea(profile));

	async function loadWeather(key: string, at: Place, sea: boolean) {
		weather = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/point.json?lat=${at.lat}&lon=${at.lon}${sea ? '&marine=1' : ''}`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (weather?.key === key) weather = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			const value = await response.json();
			if (weather?.key === key) weather = { key, status: 'ok', value };
		} catch {
			if (weather?.key === key) weather = { key, status: 'error' };
		}
	}

	$effect(() => {
		const at = cell;
		const sea = withSea;
		if (!at) return;
		const key = `${at.lat},${at.lon},${sea}`;
		untrack(() => {
			if (weather?.key !== key) void loadWeather(key, at, sea);
		});
	});
	const w = $derived(weather?.status === 'ok' ? (weather.value ?? null) : null);
	// The credit of the sky card (NOAA, and the weather source of the clouds), given by the card once it has loaded.
	let skyCredit = $state<string | null>(null);

	// --- the place in one sentence, and its cards ---------------------------------------------------------
	const sentence = $derived(
		place
			? placeSentence({
					lang,
					profile,
					official,
					warnings: here.map((h) => h.warning),
					hazards: near,
					weather: w,
					now
				})
			: []
	);
	const order = $derived(cardOrder(profile, here.length > 0));

	// --- map --------------------------------------------------------------------------------------------
	const zones = $derived.by((): FeatureCollection => {
		const byShape = new Map<string, { cc: string; shape: string; levels: Level[] }>();
		for (const h of here) {
			const { cc, shape, level } = h.warning;
			if (!shape) continue;
			const key = `${cc}:${shape}`;
			const entry = byShape.get(key) ?? { cc, shape, levels: [] };
			entry.levels.push(level as Level);
			byShape.set(key, entry);
		}
		const features: Feature[] = [];
		for (const [key, { cc, shape, levels }] of byShape) {
			const geometry = countries.get(cc)?.data?.shapes[shape];
			if (geometry)
				features.push({ type: 'Feature', geometry, properties: { key, level: maxLevel(levels) ?? 'NONE' } });
		}
		const rank = (f: Feature) => LEVELS.length - LEVELS.indexOf(f.properties?.level as Level);
		features.sort((a, b) => rank(a) - rank(b));
		return { type: 'FeatureCollection', features };
	});
	const frame = $derived(place ? circleBox(place, radiusKm) : null);
	const mapPlace = $derived(place ? { ...place, radiusKm } : null);

	const coord = (value: number, positive: string, negative: string) =>
		`${number(lang, Math.abs(value), 3)}° ${value >= 0 ? positive : negative}`;
	const where = (p: Place) => `${coord(p.lat, 'N', 'S')}, ${coord(p.lon, 'E', lang === 'fr' ? 'O' : 'W')}`;
	const km = (value: number) => number(lang, value, value < 10 ? 1 : 0);
	const unit = (value: number | null | undefined, u: string, digits = 1) =>
		value == null ? '–' : `${number(lang, value, digits)} ${u}`;
	const day = (date: string) =>
		new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
			weekday: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T12:00:00Z`));

	const CARD_TITLE: Record<Card, Key> = {
		official: 'card.official',
		hazards: 'card.hazards',
		weather: 'card.weather',
		sea: 'card.sea',
		sky: 'card.sky',
		air: 'card.air'
	};
</script>

<Seo title={tr('near.title')} description={tr('near.description')} />

{#snippet weatherState()}
	{#if weather?.status === 'budget'}
		<p class="note">{tr('near.weatherBudget')}</p>
	{:else if weather?.status === 'error'}
		<p class="note">{tr('near.weatherFailed')}</p>
	{:else}
		<p class="muted">{tr('detail.loading')}</p>
	{/if}
{/snippet}

<!-- Official warnings ------------------------------------------------------------------------------------ -->
{#snippet officialBadge()}
	{#if official === 'nosource'}
		<span class="pill nosource">{tr('card.noSource')}</span>
	{:else if official === 'none'}
		<span class="pill calm">{tr('card.nothing')}</span>
	{:else if here.length}
		<LevelPill {lang} level={here[0].warning.level} />
	{/if}
{/snippet}
{#snippet officialSummary()}
	{#if official === 'nosource'}
		<p class="verdict">{tr('card.noSourceHere')}</p>
		<p class="small">
			{country ? tr('near.noSourceIn', { country: countryName(lang, country) }) : tr('near.noSource')}
			<a href="/countries">{tr('nav.countries')}</a>
		</p>
		{#if why}
			<p class="muted small">
				{tr('near.why', { reason: tOr(lang, `uncovered.${why.reasonCode}`, why.reasonCode ?? '') })}
				<!-- The API's own sentence is in English: an English page only. -->
				{#if why.reason && lang === 'en'}<span lang="en">{why.reason}</span>{/if}
			</p>
		{/if}
	{:else}
		<p class="verdict">
			{here.length
				? tr('card.inForce', { n: here.length })
				: official === 'none' || official === 'unplaced'
					? tr('card.noneHere')
					: official === 'loading'
						? tr('detail.loading')
						: '–'}
		</p>
		{#if loading.length && !here.length}
			<p class="muted small">
				{tr('list.loadingWarnings', { countries: loading.map((cc) => countryName(lang, cc)).join(', ') })}
			</p>
		{/if}
		{#if failed.length}
			<p class="note">
				{tr('list.failedWarnings', { countries: failed.map((cc) => countryName(lang, cc)).join(', ') })}
			</p>
		{/if}
		{#each unplaced as u (u.cc)}
			<p class="muted small">
				{tr('near.unplaced', { n: u.n, country: countryName(lang, u.cc) })}
				<a href="/country/{u.cc.toLowerCase()}">{countryName(lang, u.cc)}</a>
			</p>
		{/each}
	{/if}
{/snippet}
{#snippet officialDetails()}
	<div class="list">
		{#each here as h (h.warning.cc + h.warning.id)}
			<div class="item">
				<AlertRow {lang} row={warningRow(h.warning)} {now} />
				{#if h.distanceKm != null}
					<p class="muted small distance">
						{tr(h.river ? 'near.riverDistance' : 'near.areaMargin', { km: km(h.distanceKm) })}
					</p>
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<!-- Hazards around ---------------------------------------------------------------------------------------- -->
{#snippet hazardsSummary()}
	<p class="verdict">
		{near.length ? tr('card.hazardsSome', { n: near.length }) : tr('card.hazardsNone')}
	</p>
	{#if w?.fires && w.fires.count != null}
		{@const fkm = number(lang, w.fires.radiusKm, 0)}
		<p class="small muted">
			{w.fires.count === 0
				? tr('w.firesNone', { km: fkm })
				: `${tr('w.firesCount', { km: fkm })} : ${w.fires.count}`}
		</p>
	{/if}
{/snippet}
{#snippet hazardsDetails()}
	{#if near.length}
		<div class="list">
			{#each near as h (h.hazard.id)}
				<div class="item">
					<AlertRow {lang} row={hazardRow(h.hazard)} {now} />
					<p class="muted small distance">{tr('near.distance', { km: km(h.distanceKm) })}</p>
				</div>
			{/each}
		</div>
	{/if}
	{#if w}<PointWeather {lang} weather={w} parts={['fires']} />{/if}
{/snippet}

<!-- Weather ----------------------------------------------------------------------------------------------- -->
{#snippet weatherSummary()}
	{#if w?.current}
		{@const c = w.current}
		<div class="figs">
			<div>
				<p class="fig">{unit(c.tempC, '°C')}</p>
				<span>{skyLabel(lang, c.code)}</span>
			</div>
			<div>
				<p class="fig">{unit(c.feelsLikeC, '°C')}</p>
				<span>{tr('fig.feels')}</span>
			</div>
			<div>
				<p class="fig">{unit(c.windKmh, 'km/h', 0)} {compass(lang, c.windDeg)}</p>
				<span>{tr('fig.wind')}</span>
			</div>
			{#if w.rain?.expected60 != null}
				<div>
					<p class="fig">{w.rain.expected60 ? unit(w.rain.maxMmH, 'mm/h') : '0 mm/h'}</p>
					<span>{tr('fig.rainHour')}</span>
				</div>
			{/if}
		</div>
		{#if w.daily.length > 1}
			<ul class="days">
				{#each w.daily.slice(1, 4) as d (d.date)}
					<li>
						<span class="muted">{day(d.date)}</span>
						<span class="data">{number(lang, d.tminC, 0)}° / {number(lang, d.tmaxC, 0)}°</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if w}
		<p class="muted">–</p>
	{:else}
		{@render weatherState()}
	{/if}
{/snippet}
{#snippet weatherDetails()}
	{#if cell}
		<!-- The position that was sent for the weather: the grid point, not the place. -->
		<p class="muted small">
			{tr('near.weatherCell', {
				lat: coord(cell.lat, 'N', 'S'),
				lon: coord(cell.lon, 'E', lang === 'fr' ? 'O' : 'W')
			})}
		</p>
	{/if}
	{#if w}<PointWeather {lang} weather={w} parts={['now', 'rain', 'days', 'river']} />{/if}
{/snippet}

<!-- Sea --------------------------------------------------------------------------------------------------- -->
{#snippet seaSummary()}
	{#if !withSea}
		<button type="button" class="btn quiet" onclick={() => (marine = true)}>{tr('near.marine')}</button>
	{:else if w?.marine}
		{@const m = w.marine}
		<div class="figs">
			<div>
				<p class="fig">{unit(m.waveM, 'm')}</p>
				<span>{tr('fig.waves')}</span>
			</div>
			<div>
				<p class="fig">{unit(m.wavePeriodS, 's', 0)}</p>
				<span>{tr('fig.period')}</span>
			</div>
			<div>
				<p class="fig">{compass(lang, m.waveDeg)}</p>
				<span>{tr('fig.from')}{m.waveDeg != null ? ` (${number(lang, m.waveDeg, 0)}°)` : ''}</span>
			</div>
		</div>
	{:else if w}
		<p class="muted small">{tr('card.seaNone')}</p>
	{:else}
		{@render weatherState()}
	{/if}
{/snippet}
{#snippet seaDetails()}
	{#if w}<PointWeather {lang} weather={w} parts={['marine']} />{/if}
{/snippet}

<!-- Sky --------------------------------------------------------------------------------------------------- -->
{#snippet skySummary()}
	<!-- The aurora of the coming night in one sentence (the API's estimate, said to be one), not NOAA's raw index. -->
	<NearSky {lang} {cell} bare link onattribution={(a) => (skyCredit = a)} />
{/snippet}

<!-- Air --------------------------------------------------------------------------------------------------- -->
{#snippet airSummary()}
	{#if w?.air}
		<div class="figs">
			<div>
				<p class="fig">{number(lang, w.air.eaqi, 0)}</p>
				<span>{tr('fig.eaqi')}</span>
			</div>
			<div>
				<p class="fig">{number(lang, w.air.pm25)}</p>
				<span>{tr('fig.pm25')}</span>
			</div>
			<div>
				<p class="fig">{number(lang, w.current?.uv ?? null)}</p>
				<span>{tr('fig.uv')}</span>
			</div>
		</div>
	{:else if w}
		<p class="muted">–</p>
	{:else}
		{@render weatherState()}
	{/if}
{/snippet}
{#snippet airDetails()}
	{#if w}<PointWeather {lang} weather={w} parts={['air']} />{/if}
{/snippet}

{#snippet card(name: Card)}
	{@const details: Record<Card, Snippet | undefined> = {
		official: here.length ? officialDetails : undefined,
		hazards: near.length || w?.fires ? hazardsDetails : undefined,
		weather: w ? weatherDetails : undefined,
		sea: w?.marine ? seaDetails : undefined,
		sky: undefined,
		air: w?.air ? airDetails : undefined
	}}
	{@const summaries: Record<Card, Snippet> = {
		official: officialSummary,
		hazards: hazardsSummary,
		weather: weatherSummary,
		sea: seaSummary,
		sky: skySummary,
		air: airSummary
	}}
	<NearCard
		title={tr(CARD_TITLE[name], { km: radiusKm })}
		badge={name === 'official' ? officialBadge : undefined}
		summary={summaries[name]}
		details={details[name]}
		detailsLabel={tr('card.details')}
		open={(name === 'official' && here.length > 0) || (name === 'hazards' && near.length > 0)}
	/>
{/snippet}

<div class="page near">
	<header class="intro">
		<h1>{tr('near.title')}</h1>
		<p class="muted">{tr('near.privacy')}</p>
		{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	</header>

	{#if followed.length}
		<nav class="followed" aria-label={tr('near.followed')}>
			<span class="small muted">{tr('near.followed')}</span>
			{#each followed as f (`${f.lat},${f.lon}`)}
				<a
					class="chip"
					href={placeHash(f, f.radiusKm, f.profile)}
					aria-current={place && sameSpot(f, place) ? 'true' : undefined}
					onclick={(e) => {
						e.preventDefault();
						pickFollowed(f);
					}}>{f.name ?? where(f)}</a
				>
			{/each}
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
					<button type="button" class="btn quiet" aria-pressed={isFollowed} onclick={toggleFollow}>
						{isFollowed ? tr('near.unfollow') : tr('near.follow')}
					</button>
				</div>
				{#if followNote === 'full'}
					<p class="note">{tr('near.followFull', { n: MAX_FOLLOWED })}</p>
				{:else if followNote === 'refused'}
					<p class="note">{tr('near.followRefused')}</p>
				{/if}

				{#if sentence.length}
					<div class="said">
						<p class="sentence">{sentence.join(' ')}</p>
						<p class="muted small">{tr('sentence.note')}</p>
					</div>
				{/if}

				<div class="cards">
					{#each order as name (name)}{@render card(name)}{/each}
				</div>
			{/if}
		</div>

		<aside class="side">
			<div class="map">
				<MapView
					{lang}
					{zones}
					hazards={near.map((h) => h.hazard)}
					{frame}
					place={mapPlace}
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
				{#if data.accounts}
					<p class="small">
						<a href="/account/zones/new{placeHash(place, radiusKm)}" rel="nofollow"
							>{tr('zones.watchHere', { km: radiusKm })}</a
						>
					</p>
				{/if}
			{/if}
		</aside>
	</div>

	{#if place}
		<!-- The credits of what the page shows: the warnings found here, the hazards around, the weather. -->
		<Credits
			{lang}
			credits={[
				...credits,
				near.length ? data.hazardsAttribution : null,
				...(w ? pointCredits(w) : []),
				skyCredit
			]}
		/>
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
	.cards :global(.verdict) {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 20px;
		line-height: 1.2;
	}
	.cards :global(.figs) {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 22px;
	}
	.cards :global(.figs > div) {
		display: flex;
		flex-direction: column;
	}
	.cards :global(.fig) {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: 24px;
		font-weight: 600;
		line-height: 1.15;
	}
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
	}
	.days li {
		display: flex;
		flex-direction: column;
	}
	.cards :global(.figs span) {
		font-size: 12.5px;
		color: var(--muted);
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
	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.item {
		display: flex;
		flex-direction: column;
	}
	.distance {
		margin: -6px 0 6px 14px;
	}
</style>
