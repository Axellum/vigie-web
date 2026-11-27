<script lang="ts">
	// "Should you go?" for every spot, on a map in a frame: the activity (surf, kite, boat, shore fishing) in the bar over the map
	// and in the address, kept in this browser for the next visit; the answer in one sentence and the spots in a list, in the panel
	// beside it; on the map, a pin per spot with its verdict, the figures of the hour for the activity and the way the tide goes,
	// which opens the spot's card; on the left of the map, the families of layers (the spots, the wind, the rain) and their
	// choices. On a phone, the answer, then the map, then the list; the card is a sheet at the bottom of the screen.
	// The verdicts are the API's, rules of Vigie; what it did not give is left out. Not for safety.
	import { onMount, tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { ACTIVITY_IDS, activityText, type ActivityId, type Verdict } from '#lib/activities.js';
	import Credits from '#lib/components/Credits.svelte';
	import FlowScale from '#lib/components/FlowScale.svelte';
	import LayerRow from '#lib/components/LayerRow.svelte';
	import LayersPanel from '#lib/components/LayersPanel.svelte';
	import MapRail, { type RailFamily } from '#lib/components/MapRail.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import RadarCard from '#lib/components/RadarCard.svelte';
	import RainScale from '#lib/components/RainScale.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import WindCard from '#lib/components/WindCard.svelte';
	import { readFollowed } from '#lib/followed.js';
	import type { Box } from '#lib/geo.js';
	import { translator, type Key } from '#lib/i18n.js';
	import { pollWhileVisible } from '#lib/pollVisible.js';
	import { RadarLayer } from '#lib/radarLayer.svelte.js';
	import { RainFieldLayer } from '#lib/rainFieldLayer.svelte.js';
	import { answerText } from '#lib/sea/answer.js';
	import { buoysText } from '#lib/sea/buoys.js';
	import { DEFAULT_CHOICE, readChoice, updateChoice, type SeaChoice } from '#lib/sea/choice.js';
	import { BAND, pinFeatures, seaPins, windIsTheFigure } from '#lib/sea/map.js';
	import { answerOf, NEAR_KM, rankSpots, SLUGS } from '#lib/sea/overview.js';
	import SeaSettings from '#lib/sea/SeaSettings.svelte';
	import SeaSpotRow from '#lib/sea/SeaSpotRow.svelte';
	import SpotBubble from '#lib/sea/SpotBubble.svelte';
	import TownBubble from '#lib/sea/TownBubble.svelte';
	import type { Town } from '#lib/sea/town.js';
	import { apiSentence, seaText } from '#lib/sea/text.js';
	import { windRangeText } from '#lib/sea/units.js';
	import { dayLabel, hourLabel } from '#lib/surf.js';
	import { windTime } from '#lib/wind.js';
	import { nearestHour, WindFieldLayer } from '#lib/windFieldLayer.svelte.js';
	import { WindLayer } from '#lib/windLayer.svelte.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const tr = $derived(translator(lang));
	const overview = $derived(data.overview);

	// What this browser chose, read once the page is shown: the page the server wrote is the same for everybody.
	let choice = $state<SeaChoice>(DEFAULT_CHOICE);
	let mounted = $state(false);
	let me = $state<{ lat: number; lon: number; name: string | null } | null>(null);
	let locating = $state<'idle' | 'busy' | 'failed'>('idle');

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

	// Each activity's best verdict in the bar: among the spots near the place, else among all of them.
	const bestOf = (id: ActivityId): Verdict | null => {
		const list = overview ? rankSpots(overview.spots, id, me) : [];
		const pool = me ? list.filter((r) => r.km != null && r.km <= NEAR_KM) : list;
		return pool[0]?.activity.verdict ?? null;
	};
	const glyph = (v: Verdict | null) =>
		v === 'good' ? '✓' : v === 'possible' ? '~' : v === 'poor' ? '✕' : '';
	const word = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');

	// --- the map: the pins of the spots (`sea/map.ts`), their dots, the card of the spot chosen --------------------------------
	const pins = $derived(seaPins(lang, rows, data.surf, active, choice.unit, choice.beachWind));
	const dots = $derived(pinFeatures(pins));
	const frame = $derived.by((): Box | null => {
		if (!rows.length) return null;
		const lats = rows.map((r) => r.spot.lat);
		const lons = rows.map((r) => r.spot.lon);
		return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
	});

	let mapView = $state<MapView>();
	let mapBox = $state<HTMLDivElement>();
	let bubbleBox = $state<HTMLDivElement>();
	let chosen = $state<string | null>(null);
	const chosenSpot = $derived(chosen ? (overview?.spots.find((s) => s.id === chosen) ?? null) : null);
	const chosenSurf = $derived(chosen ? (data.surf?.find((s) => s.id === chosen) ?? null) : null);

	// A town whose name was clicked on the map: its card takes the place of a spot's, and the other way round.
	let town = $state<Town | null>(null);

	async function open(id: string) {
		chosen = id;
		town = null;
		await tick();
		const spot = overview?.spots.find((s) => s.id === id);
		if (spot) bringOut([spot.lon, spot.lat]);
	}
	async function openTown(next: Town) {
		chosen = null;
		town = next;
		await tick();
		bringOut([next.lon, next.lat]);
	}
	function bringOut(at: [number, number]) {
		if (!mapBox || !bubbleBox) return;
		// The card covers the right of the map on a computer, the bottom of the screen on a phone: on a phone the map is first
		// brought to the top of the screen, then, on both, the spot or the town is brought out from under the card.
		const sheet = matchMedia('(max-width: 899px)').matches;
		if (sheet) {
			const top = mapBox.getBoundingClientRect().top;
			if (Math.abs(top) > 4) window.scrollBy({ top, behavior: 'instant' });
		}
		const m = mapBox.getBoundingClientRect();
		const b = bubbleBox.getBoundingClientRect();
		mapView?.reveal(at, {
			right: sheet ? 0 : Math.max(0, m.right - b.left),
			bottom: sheet ? Math.max(0, m.bottom - b.top) : 0
		});
	}
	function close() {
		const id = chosen;
		chosen = null;
		town = null;
		// The keyboard goes back to the pin that opened the card.
		if (id) void tick().then(() => document.querySelector<HTMLElement>(`[data-spot="${id}"]`)?.focus());
	}
	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && (chosen || town)) close();
	}

	// --- the layers of the frame: the spots always, the wind and the rain on demand (the choices kept as on the home map) -------
	type Family = 'spots' | 'wind' | 'rain';
	const FAMILIES: Family[] = ['spots', 'wind', 'rain'];
	let family = $state<Family | null>(null);
	let view = $state<Box | null>(null);
	let zoom = $state(0);

	const wind = new WindLayer();
	onMount(() => wind.restore());
	$effect(() => wind.move(view, zoom));
	$effect(() => {
		void wind.on;
		void view;
		untrack(() => wind.sync());
	});
	$effect(() => pollWhileVisible(() => wind.sync(), 60_000));

	const flow = new WindFieldLayer();
	onMount(() => flow.restore());
	$effect(() => flow.move(view, zoom));
	$effect(() => {
		void flow.on;
		void flow.wanted;
		untrack(() => flow.sync());
	});
	$effect(() => pollWhileVisible(() => flow.sync(), 60_000));

	// The radar stays folded on the sea map until it is asked for (it opens by itself on the home map).
	const radar = new RadarLayer();
	radar.open = false;
	$effect(() => radar.move(view, zoom));
	$effect(() => {
		void radar.wanted;
		void radar.area;
		untrack(() => radar.sync());
	});
	$effect(() => pollWhileVisible(() => radar.sync(), 60_000));
	$effect(() => () => radar.pause());

	const rainField = new RainFieldLayer();
	onMount(() => rainField.restore());
	$effect(() => rainField.move(view, zoom));
	$effect(() => {
		void rainField.on;
		untrack(() => rainField.sync());
	});
	$effect(() => pollWhileVisible(() => rainField.sync(), 60_000));

	// The wind is on the labels of the kite and the boat whatever is chosen: it counts as a layer shown.
	const windOnPins = $derived(windIsTheFigure(active));
	const countOf = (f: Family): number =>
		f === 'wind'
			? Number(windOnPins || choice.beachWind) + Number(flow.on) + Number(wind.on)
			: f === 'rain'
				? Number(radar.open && radar.covered) + Number(rainField.on)
				: 0;
	const familyOn = (f: Family): boolean => f === 'spots' || countOf(f) > 0;
	const familyName = (f: Family): string =>
		f === 'spots' ? t('family.spots') : tr(`frame.family.${f}` as Key);
	const railFamilies = $derived<RailFamily[]>(
		FAMILIES.map((f) => ({
			id: f,
			icon: f,
			label: familyName(f),
			count: countOf(f),
			countSaid: tr(countOf(f) > 1 ? 'frame.countMany' : 'frame.count', { count: countOf(f) }),
			on: familyOn(f)
		}))
	);

	const name = $derived(activityText(lang, `activity.${active}`));
	const pageTitle = $derived(data.activity ? `${name} · ${t('title')}` : `${t('page')} · ${t('title')}`);
	const description = $derived(data.activity ? t(`meta.${data.activity}`) : t('intro'));
	const rangeSaid = $derived(
		active === 'kite' && overview?.windRange ? windRangeText(lang, overview.windRange, choice.unit) : null
	);
</script>

<Seo title={pageTitle} {description} />
<svelte:window onkeydown={onKey} />

<div class="sea-app">
	<div class="panel">
		<div class="summary">
			<header class="intro">
				<h1>{t('title')}</h1>
				<p class="muted small">{t('intro')}</p>
			</header>
			{#if overview}
				<section class="answer" aria-live="polite" aria-label={name}>
					<h2 class="visually-hidden">{name}</h2>
					<p class="sentence">{sentence}</p>
					{#if rangeSaid}<p class="muted small">{t('windCurrent', { range: rangeSaid })}</p>{/if}
					{#if data.rangeDenied}<p class="note small">{t('windDenied')}</p>{/if}
					{#if overview.stale}<p class="note small">{t('stale')}</p>{/if}
				</section>
			{/if}
		</div>

		<div class="details">
			{#if overview}
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

				{#if mounted}
					<SeaSettings {lang} {choice} applied={overview.windRange} onchange={change} />
				{/if}

				<div class="links">
					<p class="muted small"><a href="/surf">{t('surfPage')}</a></p>
					<p class="muted small"><a href="/sea/places">{t('placesPage')}</a></p>
					<p class="muted small"><a href="/sea/buoys">{buoysText(lang, 'seaPageLink')}</a></p>
					<p class="muted small">
						{t('updated', {
							time: `${dayLabel(lang, overview.generated)}, ${hourLabel(lang, overview.generated)}`
						})}
					</p>
					{#if overview.limits}
						{@const said = apiSentence(lang, overview.limits)}
						<p class="muted small" lang={said.lang}>{said.text}</p>
					{/if}
					{#if overview.disclaimer}
						{@const said = apiSentence(lang, overview.disclaimer)}
						<p class="note small" lang={said.lang}>{said.text}</p>
					{/if}
				</div>
			{:else}
				<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
			{/if}

			<Credits
				{lang}
				credits={[
					overview?.attribution,
					wind.on ? wind.data?.attribution : null,
					flow.on ? flow.field?.attribution : null,
					radar.open && radar.covered ? radar.data?.attribution : null,
					radar.open && radar.covered ? radar.nowcastAttribution : null,
					rainField.on ? rainField.field?.attribution : null
				]}
			/>
		</div>
	</div>

	<div class="stage">
		<nav class="pills" aria-label={t('myActivity')}>
			<span class="label" aria-hidden="true">{t('myActivity')}</span>
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

		<div class="frame">
			<MapRail
				label={tr('frame.layers')}
				families={railFamilies}
				bind:open={() => family, (next) => (family = next as Family | null)}
				controls="sea-layers"
			/>

			<div class="mapzone" bind:this={mapBox}>
				<MapView
					bind:this={mapView}
					{lang}
					spots={dots}
					{pins}
					{frame}
					selected={chosen ? { kind: 'spot', id: chosen } : null}
					place={town ? { lat: town.lat, lon: town.lon, radiusKm: null } : null}
					ontown={(next) => void openTown(next)}
					label={t('map')}
					radar={radar.onMap(tr('radar.credit'))}
					rainField={rainField.onMap(tr('rainField.credit'))}
					wind={wind.data ? { points: wind.data.points, unit: wind.unit } : null}
					flow={flow.grids}
					onselect={(s) => {
						if (s.kind === 'spot') void open(s.id);
					}}
					onmove={(v, z) => {
						view = v;
						zoom = z;
					}}
				/>

				<WindCard {lang} {wind} />
				{#if radar.open}<RadarCard {lang} {radar} />{/if}
				{#if rainField.on && rainField.active && !wind.on && family !== 'rain'}
					<div class="rf-badge" role="status" data-testid="rain-field-badge">
						<span class="eyebrow">
							{tr('rainField.badge', {
								model: rainField.active.level.model,
								lead: rainField.active.frame.leadHours,
								time: windTime(lang, rainField.active.frame.validUtc)
							})}
						</span>
						<span class="rf-note">{tr('rainField.notRadarShort')}</span>
					</div>
				{/if}

				{#if family}
					<LayersPanel
						id="sea-layers"
						title={familyName(family)}
						closeLabel={tr('frame.close')}
						onclose={() => (family = null)}
					>
						{#if family === 'spots'}
							<p class="small">{t('layers.spotsHint')}</p>
							<p class="muted small">{t('layers.spotsLegend')}</p>
							<ul class="legend">
								{#each ['good', 'possible', 'poor'] as const as v (v)}
									<li><span class="swatch surf-q{BAND[v]}"></span>{word(v)}</li>
								{/each}
								<li><span class="swatch surf-qn"></span>{word(null)}</li>
							</ul>
						{:else if family === 'wind'}
							<p class="small">{t('layers.windDesc')}</p>
							<LayerRow
								name={t('layers.beachWind')}
								source={t(windOnPins ? 'layers.beachWindAlways' : 'layers.beachWindSub')}
								disabled={windOnPins}
								testid="beach-wind-toggle"
								bind:checked={() => windOnPins || choice.beachWind, (on) => change({ beachWind: on })}
							/>
							<LayerRow
								name={tr('frame.flow')}
								source={tr('frame.flowSub')}
								testid="flow-toggle"
								bind:checked={flow.on}
							/>
							{#if flow.on}
								{#if flow.field?.status === 'off'}
									<p class="muted small">{tr('flow.off')}</p>
								{:else if flow.field?.status === 'unavailable' || (flow.status === 'failed' && !flow.field)}
									<p class="muted small">{tr('flow.failed')}</p>
								{:else if flow.valid !== null}
									<p class="muted small" data-testid="flow-legend">
										{tr(
											flow.field?.stale || flow.valid !== nearestHour(Date.now())
												? 'flow.legendOld'
												: 'flow.legend',
											{ time: windTime(lang, flow.valid) }
										)}
									</p>
									<FlowScale {lang} unit={choice.unit} testid="flow-scale" />
									<p class="muted small">{tr('flow.note')}</p>
								{:else}
									<p class="muted small">{tr('flow.loading')}</p>
								{/if}
							{/if}
							<LayerRow
								name={tr('frame.measured')}
								source={tr('frame.measuredSub')}
								testid="wind-toggle"
								bind:checked={wind.on}
							/>
							{#if wind.on}<p class="muted small">{tr('wind.note')}</p>{/if}
						{:else}
							<p class="small">{t('layers.rainDesc')}</p>
							<LayerRow
								name={tr('frame.radar')}
								source={tr('frame.radarSub')}
								testid="radar-toggle"
								bind:checked={radar.open}
							/>
							{#if radar.open}
								<p class="muted small" data-testid="radar-coverage">
									{tr(radar.covered ? 'frame.radarHint' : 'frame.radarNone')}
								</p>
							{/if}
							<LayerRow
								name={tr('frame.rainField')}
								source={tr('frame.rainFieldSub')}
								testid="rain-field-toggle"
								bind:checked={rainField.on}
							/>
							{#if rainField.on}
								{#if rainField.field?.status === 'off'}
									<p class="muted small">{tr('rainField.off')}</p>
								{:else if rainField.field?.status === 'unavailable' || (rainField.status === 'failed' && !rainField.field)}
									<p class="muted small">{tr('rainField.failed')}</p>
								{:else if rainField.active && rainField.field}
									<div
										class="chips"
										role="group"
										aria-label={tr('rainField.leads')}
										data-testid="rain-field-leads"
									>
										{#each rainField.leads as h (h)}
											<button
												type="button"
												class="chip"
												aria-pressed={rainField.leadHours === h}
												onclick={() => rainField.setLead(h)}>+{h} h</button
											>
										{/each}
									</div>
									<p class="muted small" data-testid="rain-field-legend">
										{tr('rainField.legend', {
											model: rainField.active.level.model,
											time: windTime(lang, rainField.active.frame.validUtc),
											lead: rainField.active.frame.leadHours
										})}
									</p>
									<RainScale {lang} legend={rainField.field.legend} testid="rain-field-scale" />
									<p class="muted small">{tr('rainField.notRadar')}</p>
								{:else}
									<p class="muted small">{tr('rainField.loading')}</p>
								{/if}
							{/if}
						{/if}
					</LayersPanel>
				{/if}

				{#if chosenSpot || town}
					<div class="bubble-slot" bind:this={bubbleBox}>
						{#if chosenSpot}
							{#key chosenSpot.id}
								<SpotBubble
									{lang}
									spot={chosenSpot}
									surf={chosenSurf}
									activity={active}
									unit={choice.unit}
									onpick={(id) => {
										choose(id);
										void goto(hrefOf(id), { reset: false });
									}}
									onclose={close}
								/>
							{/key}
						{:else if town}
							{#key `${town.lat},${town.lon}`}
								<TownBubble {lang} {town} {pins} onspot={(id) => void open(id)} onclose={close} />
							{/key}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* A phone: the answer, the bar of the activities and the map, then the list; the panel's two parts take their place in the
	   page's column. A computer (900 px and more): the panel on the left, scrolled on its own, the map in the rest of the screen. */
	.sea-app {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.panel {
		display: contents;
	}
	.summary,
	.details {
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.summary {
		order: 1;
		padding-block: 16px 12px;
	}
	.stage {
		order: 2;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.details {
		order: 3;
		padding-block: 16px 32px;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.intro p {
		margin: 0;
	}
	.mapzone {
		position: relative;
		height: 62vh;
		min-height: 360px;
		min-width: 0;
	}
	@media (min-width: 900px) {
		.sea-app {
			display: grid;
			grid-template-columns: minmax(340px, 400px) minmax(0, 1fr);
		}
		.panel {
			display: flex;
			flex-direction: column;
			min-height: 0;
			overflow-y: auto;
			border-right: 1px solid var(--line);
			background: var(--surface);
		}
		.summary,
		.details {
			padding-left: 18px;
			padding-right: 18px;
		}
		.summary {
			padding-top: 18px;
		}
		.stage {
			min-height: 0;
		}
		.mapzone {
			flex: 1;
			height: auto;
			min-height: 0;
		}
		.stage {
			display: flex;
			flex-direction: column;
		}
	}

	/* The bar of the activities, over the top of the map. */
	.pills {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px var(--gutter-r) 8px var(--gutter);
		background: var(--surface);
		border-block: 1px solid var(--line);
		min-width: 0;
	}
	.pills .label {
		flex: none;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 14px;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.pills ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
	}
	.pills a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 4px 12px;
		border: 1px solid var(--line);
		border-radius: 18px;
		color: inherit;
		text-decoration: none;
		font-weight: 600;
		font-size: 14px;
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
	@media (max-width: 640px) {
		.pills .label {
			display: none;
		}
	}
	@media (min-width: 900px) {
		.pills {
			border-top: 0;
			padding-inline: 14px;
		}
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

	/* The frame of the map: the rail of the families of layers (`MapRail`), a row under the bar on a phone, a column on its
	   left on a computer; nothing of it over the map, where the coast and its pins are. */
	.frame {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	@media (min-width: 900px) {
		.frame {
			flex: 1;
			flex-direction: row;
			min-height: 0;
		}
	}

	/* The forecast rain said on the map when the layers are folded: a forecast, not a radar. */
	.rf-badge {
		position: absolute;
		left: 10px;
		top: 10px;
		z-index: 3;
		max-width: calc(100% - 70px);
		padding: 6px 10px;
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rf-note {
		font-size: 11.5px;
		color: var(--muted);
	}

	/* The card of a spot: on the right of the map on a computer, a sheet at the bottom of the screen on a phone. */
	.bubble-slot {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		max-height: 62dvh;
		display: flex;
		flex-direction: column;
	}
	.bubble-slot :global(.bubble) {
		border-radius: 16px 16px 0 0;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	@media (min-width: 900px) {
		.bubble-slot {
			position: absolute;
			left: auto;
			top: 10px;
			right: 52px;
			bottom: 12px;
			width: min(400px, calc(100% - 120px));
			max-height: none;
			z-index: 6;
			justify-content: flex-start;
		}
		.bubble-slot :global(.bubble) {
			border-radius: 14px;
		}
	}

	.sentence {
		margin: 0;
		font-size: 19px;
		font-weight: 600;
		line-height: 1.35;
	}
	.answer p,
	.where p,
	.links p {
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
	@media (min-width: 900px) {
		.spots {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.far summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--muted);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
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
