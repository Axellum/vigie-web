<script lang="ts">
	// One card of a place (official warnings, hazards around, weather, sea, tide, surf spots, sky, air): the same cards "near
	// me" shows, and "my page" lays out in the order the person chose. It reads everything from the place's state
	// (`placeState.svelte.ts`) and holds nothing of its own.
	import type { Snippet } from 'svelte';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import AvalanchePanel from '#lib/components/AvalanchePanel.svelte';
	import CatNatPanel from '#lib/components/CatNatPanel.svelte';
	import ClimatePanel from '#lib/components/ClimatePanel.svelte';
	import DroughtPanel from '#lib/components/DroughtPanel.svelte';
	import PollenPanel from '#lib/components/PollenPanel.svelte';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import NearCard from '#lib/components/NearCard.svelte';
	import NearSky from '#lib/components/NearSky.svelte';
	import Time from '#lib/components/Time.svelte';
	import PointWeather from '#lib/components/PointWeather.svelte';
	import SurfSpotRow from '#lib/components/SurfSpotRow.svelte';
	import TideCurve from '#lib/components/TideCurve.svelte';
	import { number } from '#lib/format.js';
	import { countryName, tOr, translator, type Key } from '#lib/i18n.js';
	import { placeFormat } from '#lib/placeFormat.js';
	import type { PlaceState } from '#lib/placeState.svelte.js';
	import type { BlockSize } from '#lib/pageConfig.js';
	import type { Card } from '#lib/profiles.js';
	import { hazardRow, warningRow } from '#lib/rows.js';
	import { nearSurfSpots, surfText } from '#lib/surf.js';
	import { droughtLevelLabel, droughtText } from '#lib/drought.js';
	import { avalancheLevelLabel, avalancheText } from '#lib/avalanches.js';
	import { catnatSummary } from '#lib/catnat.js';
	import { pollenText, speciesLabel } from '#lib/pollens.js';
	import { compass, skyLabel } from '#lib/weather.js';

	// `placeName` says which place the card is of when a page shows several; `size` is the block's size on "my page":
	// small is the summary alone, medium is the card as "near me" shows it, large has its detail open.
	let {
		state: s,
		name,
		placeName,
		size = 'm'
	}: { state: PlaceState; name: Card; placeName?: string; size?: BlockSize } = $props();
	const lang = $derived(s.lang);
	const tr = $derived(translator(lang));
	const fmt = $derived(placeFormat(lang, s.units));
	const { coord, km, unit, signed, hour, day, temp, deg, wind, length } = $derived(fmt);
	const units = $derived(s.units);

	const CARD_TITLE: Record<Card, Key> = {
		official: 'card.official',
		hazards: 'card.hazards',
		weather: 'card.weather',
		climate: 'card.climate',
		sea: 'card.sea',
		tide: 'card.tide',
		surf: 'card.surf',
		sky: 'card.sky',
		air: 'card.air'
	};
</script>

{#snippet weatherState()}
	{#if s.weather?.status === 'budget'}
		<p class="note">{tr('near.weatherBudget')}</p>
	{:else if s.weather?.status === 'error'}
		<p class="note">{tr('near.weatherFailed')}</p>
	{:else}
		<p class="muted">{tr('detail.loading')}</p>
	{/if}
{/snippet}

<!-- Official warnings ------------------------------------------------------------------------------------ -->
{#snippet officialBadge()}
	{#if s.official === 'nosource'}
		<span class="pill nosource">{tr('card.noSource')}</span>
	{:else if s.official === 'none'}
		<span class="pill calm">{tr('card.nothing')}</span>
	{:else if s.here.length}
		<LevelPill {lang} level={s.here[0].warning.level} />
	{/if}
{/snippet}
{#snippet officialSummary()}
	{#if s.official === 'nosource'}
		<p class="verdict">{tr('card.noSourceHere')}</p>
		<p class="small">
			{s.country ? tr('near.noSourceIn', { country: countryName(lang, s.country) }) : tr('near.noSource')}
			<a href="/countries">{tr('nav.countries')}</a>
		</p>
		{#if s.why}
			<p class="muted small">
				{tr('near.why', { reason: tOr(lang, `uncovered.${s.why.reasonCode}`, s.why.reasonCode ?? '') })}
				<!-- The API's own sentence is in English: an English page only. -->
				{#if s.why.reason && lang === 'en'}<span lang="en">{s.why.reason}</span>{/if}
			</p>
		{/if}
	{:else}
		<p class="verdict">
			{s.here.length
				? tr('card.inForce', { n: s.here.length })
				: s.official === 'none' || s.official === 'unplaced'
					? tr('card.noneHere')
					: s.official === 'loading'
						? tr('detail.loading')
						: '–'}
		</p>
		{#if s.loading.length && !s.here.length}
			<p class="muted small">
				{tr('list.loadingWarnings', { countries: s.loading.map((cc) => countryName(lang, cc)).join(', ') })}
			</p>
		{/if}
		{#if s.failed.length}
			<p class="note">
				{tr('list.failedWarnings', { countries: s.failed.map((cc) => countryName(lang, cc)).join(', ') })}
			</p>
		{/if}
		{#each s.unplaced as u (u.cc)}
			<p class="muted small">
				{tr('near.unplaced', { n: u.n, country: countryName(lang, u.cc) })}
				<a href="/country/{u.cc.toLowerCase()}">{countryName(lang, u.cc)}</a>
			</p>
		{/each}
		{#if s.hasDrought}
			{@const dStatus = s.drought?.status ?? s.w?.drought?.status}
			{@const dLevel = s.drought?.maxLevel ?? s.w?.drought?.maxLevel}
			<p class="small">
				{#if dLevel === 'vigilance'}
					{droughtText(lang, 'summaryVigilance')}
				{:else if dLevel}
					{droughtText(lang, 'summaryActive', { level: droughtLevelLabel(lang, dLevel) })}
				{:else if dStatus === 'confirmed_none'}
					<span class="muted">{droughtText(lang, 'summaryNone')}</span>
				{:else if dStatus === 'unavailable'}
					<span class="muted">{droughtText(lang, 'summaryUnavailable')}</span>
				{/if}
			</p>
		{/if}
		{#if s.avalanches}
			<p class="small">
				{#if s.avalanches.status === 'active' && s.avalanches.maxLevel}
					{avalancheText(lang, 'summary', { level: avalancheLevelLabel(lang, s.avalanches.maxLevel) })}
				{:else}
					<span class="muted">{avalancheText(lang, 'summaryNone')}</span>
				{/if}
			</p>
		{/if}
		{#if s.catnat}
			<p class="small muted">{catnatSummary(lang, s.catnat)}</p>
		{/if}
	{/if}
{/snippet}
{#snippet officialDetails()}
	{#if s.here.length}
		<div class="list">
			{#each s.here as h (h.warning.cc + h.warning.id)}
				<div class="item">
					<AlertRow {lang} row={warningRow(h.warning)} now={s.now} />
					{#if h.distanceKm != null}
						<p class="muted small distance">
							{tr(h.river ? 'near.riverDistance' : 'near.areaMargin', { km: km(h.distanceKm) })}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if s.hasDrought}
		<DroughtPanel {lang} status={s.w?.drought ?? null} detail={s.drought} />
	{/if}
	{#if s.avalanches}
		<AvalanchePanel {lang} value={s.avalanches} />
	{/if}
	{#if s.catnat}
		<CatNatPanel {lang} value={s.catnat} />
	{/if}
{/snippet}

<!-- Hazards around ---------------------------------------------------------------------------------------- -->
{#snippet hazardsSummary()}
	<p class="verdict">
		{s.near.length ? tr('card.hazardsSome', { n: s.near.length }) : tr('card.hazardsNone')}
	</p>
	{#if s.w?.fires && s.w.fires.count != null}
		{@const fkm = number(lang, s.w.fires.radiusKm, 0)}
		<p class="small muted">
			{s.w.fires.count === 0
				? tr('w.firesNone', { km: fkm })
				: `${tr('w.firesCount', { km: fkm })} : ${s.w.fires.count}`}
		</p>
	{/if}
{/snippet}
{#snippet hazardsDetails()}
	{#if s.near.length}
		<div class="list">
			{#each s.near as h (h.hazard.id)}
				<div class="item">
					<AlertRow {lang} row={hazardRow(h.hazard)} now={s.now} />
					<p class="muted small distance">{tr('near.distance', { km: km(h.distanceKm) })}</p>
				</div>
			{/each}
		</div>
	{/if}
	{#if s.w}<PointWeather {lang} {units} weather={s.w} parts={['fires']} />{/if}
{/snippet}

<!-- Weather ----------------------------------------------------------------------------------------------- -->
{#snippet weatherSummary()}
	{#if s.w}
		{#if s.w.stale}<p class="note">{tr('near.weatherStale')}</p>{/if}
		{#if s.w.provider || s.w.generated != null}
			<div class="weather-origin">
				{#if s.w.provider}<span>{s.w.provider}</span>{/if}
				{#if s.w.generated != null}<span>{tr('home.asOf')} <Time {lang} unix={s.w.generated} /></span>{/if}
			</div>
		{/if}
	{/if}
	{#if s.w?.current}
		{@const w = s.w}
		{@const c = s.w.current}
		<div class="figs">
			<div>
				<p class="fig">{temp(c.tempC)}</p>
				<span>{skyLabel(lang, c.code)}</span>
			</div>
			<div>
				<p class="fig">{temp(c.feelsLikeC)}</p>
				<span>{tr('fig.feels')}</span>
			</div>
			<div>
				<p class="fig">{wind(c.windKmh)} {compass(lang, c.windDeg)}</p>
				<span>{tr('fig.wind')}</span>
			</div>
			{#if w.rain?.expected60 != null}
				<div>
					<p class="fig">{w.rain.expected60 === false ? tr('w.rainNone') : unit(w.rain.maxMmH, 'mm/h')}</p>
					<span>{tr('fig.rainHour')}</span>
				</div>
			{/if}
		</div>
		{#if w.daily.length > 1}
			<ul class="days">
				{#each w.daily.slice(1, 4) as d (d.date)}
					<li>
						<span class="muted">{day(d.date)}</span>
						<span class="data">{deg(d.tminC)}° / {deg(d.tmaxC)}°</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if s.w}
		<p class="muted">–</p>
	{:else}
		{@render weatherState()}
	{/if}
{/snippet}
{#snippet weatherDetails()}
	{#if s.cell}
		<!-- The position that was sent for the weather: the grid point, not the place. -->
		<p class="muted small">
			{tr('near.weatherCell', {
				lat: coord(s.cell.lat, 'N', 'S'),
				lon: coord(s.cell.lon, 'E', lang === 'fr' ? 'O' : 'W')
			})}
		</p>
	{/if}
	{#if s.w}<PointWeather
			{lang}
			{units}
			weather={s.w}
			measured={s.nearestMeasured}
			now={s.now}
			parts={['now', 'rain', 'ensemble', 'charts', 'days', 'river']}
		/>{/if}
{/snippet}

<!-- Is it normal? (the normals of the month at the nearest Météo-France station) ----------------------- -->
{#snippet climateSummary()}
	{#if s.climate}
		<ClimatePanel
			{lang}
			{units}
			value={s.climate}
			tmax={s.w?.daily[0]?.tmaxC ?? null}
			tmin={s.w?.daily[0]?.tminC ?? null}
			part="summary"
		/>
	{:else}
		<p class="muted">–</p>
	{/if}
{/snippet}
{#snippet climateDetails()}
	{#if s.climate}
		<ClimatePanel
			{lang}
			{units}
			value={s.climate}
			tmax={s.w?.daily[0]?.tmaxC ?? null}
			tmin={s.w?.daily[0]?.tminC ?? null}
			part="details"
		/>
	{/if}
{/snippet}

<!-- Sea --------------------------------------------------------------------------------------------------- -->
{#snippet seaSummary()}
	{#if !s.withSea}
		<button type="button" class="btn quiet" onclick={() => (s.marine = true)}>{tr('near.marine')}</button>
	{:else if s.w?.marine}
		{@const m = s.w.marine}
		<div class="figs">
			<div>
				<p class="fig">{length(m.waveM)}</p>
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
	{:else if s.w}
		<p class="muted small">{tr('card.seaNone')}</p>
	{:else}
		{@render weatherState()}
	{/if}
{/snippet}
{#snippet seaDetails()}
	{#if s.w}<PointWeather {lang} {units} weather={s.w} parts={['marine']} />{/if}
{/snippet}

<!-- Tide -------------------------------------------------------------------------------------------------- -->
{#snippet tideSummary()}
	{#if s.tide.value?.now}
		{@const n = s.tide.value.now}
		<div class="figs">
			<div>
				<p class="fig">{signed(n.h)}</p>
				<span>{tr(n.trend === 'rising' ? 'fig.tideRising' : 'fig.tideFalling')}</span>
			</div>
			<!-- The next high and low waters, the nearer first. -->
			{#each [n.nextHigh, n.nextLow].filter((e) => e != null).sort((a, b) => a.t - b.t) as e (e.t)}
				<div>
					<p class="fig">{hour(e.t)}</p>
					<span>{tr(e.kind === 'high' ? 'fig.nextHigh' : 'fig.nextLow')}</span>
				</div>
			{/each}
		</div>
		<p class="muted small">{tr('card.tideNote')}</p>
	{:else if s.tide.value}
		<p class="muted">–</p>
	{:else if s.tide.state?.status === 'error'}
		<p class="note">{tr('tide.failed')}</p>
	{:else}
		<p class="muted">{tr('tide.loading')}</p>
	{/if}
{/snippet}
{#snippet tideDetails()}
	{#if s.tide.value}<TideCurve {lang} {units} curve={s.tide.value} now={s.tide.loadedAt} />{/if}
	{#if nearSurfSpots(s.cell)}<p class="small"><a href="/surf">{surfText(lang, 'tideLink')}</a></p>{/if}
{/snippet}

<!-- Surf -------------------------------------------------------------------------------------------------- -->
{#snippet surfSummary()}
	{#if s.surfAll?.status === 'ok' && s.surfAll.value}
		{#if s.surfNear.length}
			<ul class="surf-near">
				{#each s.surfNear as spot (spot.id)}<li><SurfSpotRow {lang} {spot} km={spot.km} /></li>{/each}
			</ul>
			{#if s.surfAll.value.stale}<p class="muted small">{surfText(lang, 'staleNote')}</p>{/if}
			<p class="small"><a href="/surf">{surfText(lang, 'allSpots')}</a></p>
		{:else}
			<p class="muted small">
				{surfText(lang, 'nearNone', { km: s.radiusKm })}
				<a href="/surf">{surfText(lang, 'nearNoneLink')}</a>
			</p>
		{/if}
	{:else if s.surfAll?.status === 'error'}
		<p class="note">{surfText(lang, 'failed')}</p>
	{:else}
		<p class="muted">{surfText(lang, 'loading')}</p>
	{/if}
{/snippet}

<!-- Sky --------------------------------------------------------------------------------------------------- -->
{#snippet skySummary()}
	<!-- The aurora of the coming night in one sentence (the API's estimate, said to be one), not NOAA's raw index. -->
	<NearSky {lang} cell={s.cell} bare link onattribution={(a) => (s.skyCredit = a)} />
{/snippet}

<!-- Air --------------------------------------------------------------------------------------------------- -->
{#snippet airSummary()}
	{#if s.w?.air}
		<div class="figs">
			<div>
				<p class="fig">{number(lang, s.w.air.eaqi, 0)}</p>
				<span>{tr('fig.eaqi')}</span>
			</div>
			<div>
				<p class="fig">{number(lang, s.w.air.pm25)}</p>
				<span>{tr('fig.pm25')}</span>
			</div>
			<div>
				<p class="fig">{number(lang, s.w.current?.uv ?? null)}</p>
				<span>{tr('fig.uv')}</span>
			</div>
		</div>
	{:else if s.w}
		<p class="muted">–</p>
	{:else}
		{@render weatherState()}
	{/if}
	{#if s.pollens}
		{@const top = s.pollenPeaks[0]}
		<p class="small">
			{#if top}
				{pollenText(lang, 'summary', {
					species: speciesLabel(lang, top.species),
					peak: number(lang, top.peak, 0)
				})}
			{:else}
				<span class="muted">{pollenText(lang, 'summaryNone')}</span>
			{/if}
		</p>
	{/if}
{/snippet}
{#snippet airDetails()}
	{#if s.w?.air}<PointWeather {lang} {units} weather={s.w} parts={['air']} />{/if}
	{#if s.pollens}<PollenPanel {lang} value={s.pollens} />{/if}
{/snippet}

{#snippet card()}
	{@const details: Record<Card, Snippet | undefined> = {
		official: s.here.length || s.hasDrought || s.avalanches || s.catnat ? officialDetails : undefined,
		hazards: s.near.length || s.w?.fires ? hazardsDetails : undefined,
		weather: s.w ? weatherDetails : undefined,
		climate: s.climate ? climateDetails : undefined,
		sea: s.w?.marine ? seaDetails : undefined,
		tide: s.tide.value ? tideDetails : undefined,
		surf: undefined,
		sky: undefined,
		air: s.w?.air || s.pollens ? airDetails : undefined
	}}
	{@const summaries: Record<Card, Snippet> = {
		official: officialSummary,
		hazards: hazardsSummary,
		weather: weatherSummary,
		climate: climateSummary,
		sea: seaSummary,
		tide: tideSummary,
		surf: surfSummary,
		sky: skySummary,
		air: airSummary
	}}
	<NearCard
		title={tr(CARD_TITLE[name], { km: s.radiusKm })}
		context={placeName}
		badge={name === 'official' ? officialBadge : undefined}
		summary={summaries[name]}
		details={size === 's' ? undefined : details[name]}
		detailsLabel={tr('card.details')}
		open={size === 'l' ||
			(name === 'official' && s.here.length > 0) ||
			(name === 'hazards' && s.near.length > 0)}
	/>
{/snippet}
{@render card()}

<style>
	.weather-origin {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		color: var(--muted);
		font-size: 0.875rem;
	}
	.weather-origin span:first-child {
		font-weight: 600;
	}

	.surf-near {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
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
	/* Inside every card, whichever page lays it out. */
	:global(.near-card .verdict) {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 20px;
		line-height: 1.2;
	}
	:global(.near-card .figs) {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 22px;
	}
	:global(.near-card .figs > div) {
		display: flex;
		flex-direction: column;
	}
	:global(.near-card .fig) {
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
		font-size: 24px;
		font-weight: 600;
		line-height: 1.15;
	}
	:global(.near-card .figs span) {
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
