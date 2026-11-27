<script lang="ts">
	// The card of a spot on the sea map, opened by its pin: four tabs, each asked of the site only when it is opened. Activities:
	// the four verdicts, the chosen one first (the top of the spot's page). Surf: where the beach faces and where the swell and the
	// wind come from, drawn on a compass, the figures of the current hour, the best slot and the chart of the three days. Tide: the
	// curve of the day. Weather: the sky, the rain and the sea of the grid point. Every figure is the API's; what it did not give is
	// left out. Beside the map on a computer, a sheet at the bottom of the screen on a phone. Not for safety.
	import { onMount } from 'svelte';
	import type { ActivitiesForecast, ActivityId } from '#lib/activities.js';
	import Credits from '#lib/components/Credits.svelte';
	import PointWeather from '#lib/components/PointWeather.svelte';
	import SurfChart from '#lib/components/SurfChart.svelte';
	import TideSection from '#lib/components/TideSection.svelte';
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { snapToGrid } from '#lib/near.js';
	import {
		compass,
		dayLabel,
		hourLabel,
		surfText,
		swellText,
		type SurfForecast,
		type Swell,
		type SurfHour,
		type SurfSpotNow
	} from '#lib/surf.js';
	import type { PointWeather as Weather } from '#lib/types.js';
	import type { WindUnit } from './choice.js';
	import type { SeaSpot } from './overview.js';
	import PlaceAnswer from './PlaceAnswer.svelte';
	import { seaText } from './text.js';
	import { KMH_PER_KN, windText as windInUnit } from './units.js';

	let {
		lang,
		spot,
		surf,
		activity,
		unit,
		onpick,
		onclose
	}: {
		lang: Lang;
		spot: SeaSpot;
		/** The spot in the surf overview (where it faces, the current hour); null when the overview did not answer. */
		surf: SurfSpotNow | null;
		activity: ActivityId;
		unit: WindUnit;
		onpick: (id: ActivityId) => void;
		onclose: () => void;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	type Tab = 'activities' | 'surf' | 'tide' | 'weather';
	const TABS: Tab[] = ['activities', 'surf', 'tide', 'weather'];
	// The surf opens on its own tab; the other activities on their verdicts.
	let tab = $state<Tab>('activities');

	let detail = $state<
		| { status: 'loading' }
		| { status: 'failed' }
		| { status: 'ok'; forecast: SurfForecast; verdicts: ActivitiesForecast | null }
	>({ status: 'loading' });
	let weather = $state<
		| { status: 'idle' }
		| { status: 'loading' }
		| { status: 'failed' | 'budget' }
		| { status: 'ok'; value: Weather }
	>({ status: 'idle' });

	onMount(() => {
		tab = activity === 'surf' ? 'surf' : 'activities';
		void (async () => {
			try {
				const response = await fetch(`/data/spot/${spot.id}.json`);
				if (!response.ok) throw new Error(String(response.status));
				const body = (await response.json()) as {
					forecast: SurfForecast;
					verdicts: ActivitiesForecast | null;
				};
				detail = { status: 'ok', forecast: body.forecast, verdicts: body.verdicts };
			} catch {
				detail = { status: 'failed' };
			}
		})();
	});

	// The weather of the grid point of the spot (about 5 km), asked the first time its tab is opened.
	const point = $derived(snapToGrid({ lat: spot.lat, lon: spot.lon }));
	async function loadWeather() {
		if (weather.status !== 'idle' && weather.status !== 'failed') return;
		weather = { status: 'loading' };
		try {
			const response = await fetch(`/data/point.json?lat=${point.lat}&lon=${point.lon}&marine=1`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					weather = { status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			weather = { status: 'ok', value: (await response.json()) as Weather };
		} catch {
			weather = { status: 'failed' };
		}
	}
	$effect(() => {
		if (tab === 'weather') void loadWeather();
	});

	function onTabKey(event: KeyboardEvent, i: number) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		tab = TABS[(i + step + TABS.length) % TABS.length];
		document.getElementById(`spot-tab-${tab}`)?.focus();
	}

	const forecast = $derived(detail.status === 'ok' ? detail.forecast : null);
	const verdicts = $derived(detail.status === 'ok' ? detail.verdicts : null);
	const facing = $derived(forecast?.spot.facing ?? surf?.facing ?? null);
	// The figures of the current hour: the hour of the pin (the surf overview's) when the forecast has it, so that the card and the
	// pin say the same; else the overview's alone; without the overview, the hour of the forecast under way.
	interface Now {
		t: number;
		swell: Swell;
		secondary: Swell | null;
		angle: number | null;
		power: number | null;
		sheltered: boolean | null;
		wind: SurfHour['wind'];
		tide: SurfHour['tide'];
		rating: { points: number; outOf: number } | null;
	}
	const hour = $derived.by((): Now | null => {
		const hours = forecast?.hours ?? [];
		const o = surf?.now ?? null;
		const at = Date.now() / 1000;
		const h = o ? hours.find((x) => x.t === o.t) : ([...hours].reverse().find((x) => x.t <= at) ?? hours[0]);
		if (h) return { ...h };
		return o ? { ...o, secondary: null, angle: null, power: null, sheltered: null } : null;
	});
	const swellFrom = $derived(hour?.swell.from ?? surf?.now?.swell.from ?? null);
	const windFrom = $derived(hour?.wind.from ?? surf?.now?.wind.from ?? null);

	const kmh = (value: number) => windInUnit(lang, value / KMH_PER_KN, unit);
	const windSaid = (w: SurfHour['wind']): string | null => {
		if (w.speed == null) return null;
		const parts = [kmh(w.speed)];
		if (w.gust != null && w.gust > w.speed) parts.push(`${surfText(lang, 'gusts')} ${kmh(w.gust)}`);
		const dir = w.from != null ? compass(lang, w.from) : null;
		const relative = w.relative ? surfText(lang, `relative.${w.relative}`) : null;
		return [parts.join(', '), dir, relative].filter(Boolean).join(' · ');
	};
	const tideSaid = (tide: SurfHour['tide']): string | null =>
		tide
			? [
					`${tide.height >= 0 ? '+' : ''}${number(lang, tide.height, 2)} m`,
					surfText(lang, `trend.${tide.trend}`),
					tide.stage ? surfText(lang, `stage.${tide.stage}`) : null
				]
					.filter(Boolean)
					.join(' · ')
			: null;
	const dirOf = (deg: number | null) => (deg == null ? t('compass.none') : compass(lang, deg));
	const compassLabel = $derived(
		t('compass.label', { facing: dirOf(facing), swell: dirOf(swellFrom), wind: dirOf(windFrom) })
	);
	const where = $derived(
		[
			spot.place,
			facing != null
				? surfText(lang, 'facing', { dir: compass(lang, facing), deg: Math.round(facing) })
				: null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<section class="bubble" aria-labelledby="spot-bubble-title" data-testid="spot-bubble">
	<header class="head">
		<div>
			<h2 id="spot-bubble-title">{spot.name}</h2>
			{#if where}<p class="muted small">{where}</p>{/if}
		</div>
		<button type="button" class="close" aria-label={t('bubble.close')} onclick={onclose}>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
		</button>
	</header>

	<div class="tabs" role="tablist" aria-label={t('bubble.tabs')}>
		{#each TABS as id, i (id)}
			<button
				type="button"
				role="tab"
				id="spot-tab-{id}"
				aria-selected={tab === id}
				aria-controls="spot-panel"
				tabindex={tab === id ? 0 : -1}
				onclick={() => (tab = id)}
				onkeydown={(e) => onTabKey(e, i)}>{t(`tab.${id}`)}</button
			>
		{/each}
	</div>

	<div class="body" role="tabpanel" id="spot-panel" aria-labelledby="spot-tab-{tab}">
		{#if tab === 'activities'}
			{#if verdicts}
				<PlaceAnswer {lang} v={verdicts} active={activity} {onpick} />
			{:else if detail.status === 'loading'}
				<p class="muted">{t('bubble.loading')}</p>
			{:else}
				<p class="note">{t('bubble.failed')}</p>
			{/if}
		{:else if tab === 'surf'}
			<div class="rose">
				<svg viewBox="0 0 120 120" role="img" aria-label={compassLabel}>
					<circle class="ring" cx="60" cy="60" r="46" />
					{#each [0, 90, 180, 270] as deg (deg)}
						{@const a = (deg * Math.PI) / 180}
						<text x={60 + 55 * Math.sin(a)} y={60 - 55 * Math.cos(a) + 4}>{compass(lang, deg)}</text>
					{/each}
					{#if facing != null}
						<g transform="rotate({facing} 60 60)">
							<path class="sea" d="M14 60 A46 46 0 0 1 106 60 Z" />
							<path class="shore" d="M14 60 H106" />
						</g>
					{/if}
					{#if windFrom != null}
						<g transform="rotate({windFrom} 60 60)">
							<path class="wind" d="M60 12 V40 M54 34 L60 41 L66 34" />
						</g>
					{/if}
					{#if swellFrom != null}
						<g transform="rotate({swellFrom} 60 60)">
							<path class="swell" d="M60 10 V54 M53 46 L60 55 L67 46" />
						</g>
					{/if}
				</svg>
				<ul class="keys">
					<li><span class="key k-sea"></span>{t('compass.beach')}</li>
					<li><span class="key k-swell"></span>{t('compass.swell')}</li>
					<li><span class="key k-wind"></span>{t('compass.wind')}</li>
				</ul>
			</div>
			{#if hour}
				<h3>{t('bubble.now')} · {hourLabel(lang, hour.t)}</h3>
				<dl class="facts">
					{#if swellText(lang, hour.swell)}<dt>{surfText(lang, 'swell')}</dt>
						<dd>{swellText(lang, hour.swell)}</dd>{/if}
					{#if hour.secondary?.height && hour.secondary.height >= 0.05 && swellText(lang, hour.secondary)}<dt>
							{surfText(lang, 'secondary')}
						</dt>
						<dd>{swellText(lang, hour.secondary)}</dd>{/if}
					{#if hour.angle != null}<dt>{surfText(lang, 'criterion.swell_direction')}</dt>
						<dd>{Math.round(hour.angle)}°</dd>{/if}
					{#if hour.power != null}<dt>{surfText(lang, 'power')}</dt>
						<dd>{number(lang, hour.power, 0)} kW/m</dd>{/if}
					{#if windSaid(hour.wind)}<dt>{surfText(lang, 'wind')}</dt>
						<dd>{windSaid(hour.wind)}</dd>{/if}
					{#if tideSaid(hour.tide)}<dt>{surfText(lang, 'tide')}</dt>
						<dd>{tideSaid(hour.tide)}</dd>{/if}
					<dt>{surfText(lang, 'rating')}</dt>
					<dd>
						{hour.rating
							? surfText(lang, 'points', { points: hour.rating.points, outOf: hour.rating.outOf })
							: surfText(lang, 'noRating')}
					</dd>
				</dl>
				{#if hour.sheltered}<p class="muted small">{surfText(lang, 'sheltered')}</p>{/if}
			{/if}
			{#if forecast}
				{#if forecast.best}
					<p class="best">
						<b>{t('bubble.best')}</b>
						{dayLabel(lang, forecast.best.t)}, {hourLabel(lang, forecast.best.t)} ·
						{surfText(lang, 'points', {
							points: forecast.best.rating.points,
							outOf: forecast.best.rating.outOf
						})}
					</p>
				{/if}
				<div class="chart">
					<SurfChart {lang} hours={forecast.hours} best={forecast.best?.t ?? null} now={forecast.generated} />
				</div>
				<p class="muted small">{surfText(lang, 'chartNote')}</p>
			{:else if detail.status === 'loading'}
				<p class="muted">{t('bubble.loading')}</p>
			{:else}
				<p class="note">{t('bubble.failed')}</p>
			{/if}
		{:else if tab === 'tide'}
			<TideSection
				{lang}
				at={{ lat: Math.round(spot.lat * 20) / 20, lon: Math.round(spot.lon * 20) / 20 }}
				heading="h3"
			/>
		{:else if weather.status === 'ok'}
			<PointWeather {lang} weather={weather.value} parts={['now', 'rain', 'days', 'marine']} />
			<Credits {lang} credits={[weather.value.attribution, weather.value.marine?.attribution]} />
		{:else if weather.status === 'budget'}
			<p class="note">{t('weather.budget')}</p>
		{:else if weather.status === 'failed'}
			<p class="note">{t('weather.failed')}</p>
		{:else}
			<p class="muted">{t('weather.loading')}</p>
		{/if}
		<p class="more"><a href="/surf/{spot.id}">{t('bubble.full')}</a></p>
		{#if tab === 'activities' || tab === 'surf'}
			<Credits {lang} credits={[forecast?.attribution, verdicts?.attribution]} />
		{/if}
	</div>

	<!-- The warning stays in sight whatever the tab and however far it is read. -->
	<p class="foot note">{surfText(lang, 'safety')}</p>
</section>

<style>
	.bubble {
		display: flex;
		flex-direction: column;
		min-height: 0;
		max-height: 100%;
		background: var(--surface);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 14px 14px 8px 16px;
	}
	.head h2 {
		margin: 0;
		font-size: 20px;
		line-height: 1.2;
	}
	.head p {
		margin: 2px 0 0;
	}
	.close {
		flex: none;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.close:hover {
		border-color: var(--accent);
	}
	.close svg {
		width: 14px;
		height: 14px;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
	.tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 4px;
		padding: 0 12px 8px;
		border-bottom: 1px solid var(--line);
	}
	.tabs button {
		min-height: 40px;
		padding: 4px 6px;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--muted);
		font: 600 14px/1.1 var(--font-body);
		cursor: pointer;
	}
	.tabs button:hover {
		color: var(--ink);
	}
	.tabs button[aria-selected='true'] {
		background: var(--accent-soft);
		color: var(--accent);
		box-shadow: inset 0 -2px var(--accent);
	}
	.body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.body :global(.card.top) {
		border: 0;
		padding: 0;
	}
	.body :global(.card.top h2) {
		font-size: 17px;
	}
	.body h3 {
		margin: 4px 0 0;
		font-size: 15px;
	}
	.rose {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.rose svg {
		flex: none;
		width: 132px;
		height: 132px;
	}
	.ring {
		fill: none;
		stroke: var(--line);
		stroke-width: 1.5;
	}
	.rose text {
		font: 600 10px var(--font-body);
		fill: var(--muted);
		text-anchor: middle;
	}
	.sea {
		fill: var(--accent-soft);
	}
	.shore {
		stroke: var(--ink);
		stroke-width: 3;
		stroke-linecap: round;
	}
	.swell,
	.wind {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.swell {
		stroke: var(--accent);
		stroke-width: 3.5;
	}
	.wind {
		stroke: var(--ink);
		stroke-width: 2;
		stroke-dasharray: 4 3;
	}
	.keys {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
	}
	.keys li {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.key {
		flex: none;
		width: 22px;
		height: 10px;
		border-radius: 3px;
	}
	.k-sea {
		background: var(--accent-soft);
		box-shadow: inset 0 -3px var(--ink);
	}
	.k-swell {
		height: 4px;
		background: var(--accent);
	}
	.k-wind {
		height: 2px;
		background: repeating-linear-gradient(90deg, var(--ink) 0 4px, transparent 4px 7px);
	}
	.facts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 4px 12px;
		margin: 0;
		font-size: 14px;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.best {
		margin: 0;
		font-size: 14px;
	}
	.chart {
		min-width: 0;
	}
	.more {
		margin: 4px 0 0;
		font-size: 14px;
		font-weight: 600;
	}
	.foot.note {
		flex: none;
		margin: 0;
		border-radius: 0;
		border-top: 1px solid var(--line);
		padding: 8px 16px 10px;
		font-size: 12.5px;
		line-height: 1.35;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
		margin: 0;
	}
</style>
