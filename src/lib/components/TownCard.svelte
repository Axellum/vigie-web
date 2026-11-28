<script lang="ts">
	// The whole weather of a town clicked on the home map: the Home Assistant card of vigie-api with its home and Details pages
	// (`HomeCard`, fed by `/data/card.json` and the town's official warnings as the widget page feeds it), then the air, the fires
	// seen by satellite, the drought and the surf spots nearest, from the same answer. A column of the card's hours under the
	// pointer says its whole hour. Where the card draws no home page (its rule `cardDrawsHome`: outside France, or when the API
	// fell back to another forecast), the site's own reading of the place instead, as on the "near me" page. Beside the map on a
	// computer, a sheet from the bottom on a phone.
	import { onMount } from 'svelte';
	import HomeCard from '#lib/widget/components/HomeCard.svelte';
	import PointWeather from '#lib/components/PointWeather.svelte';
	import SurfSpotRow from '#lib/components/SurfSpotRow.svelte';
	import { number } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import { distanceKm, snapToGrid } from '#lib/near.js';
	import { nearSurfSpots, type SurfOverview, type SurfSpotNow } from '#lib/surf.js';
	import { pointFromApi } from '#lib/transform.js';
	import type { PointWeather as Weather } from '#lib/types.js';
	import { compass, skyLabel } from '#lib/weather.js';
	import { hourLabel } from '#lib/widget/boardArt.js';
	import { cardDrawsHome } from '#lib/widget/cardFit.js';
	import { cardData, type CardAnswer, type CardData, type CardWarnings } from '#lib/widget/homeCard.js';

	let {
		lang,
		name,
		lat,
		lon,
		dark,
		warnings,
		onclose
	}: {
		lang: Lang;
		name: string;
		lat: number;
		lon: number;
		dark: boolean;
		/** The town's official warnings for the card; null while they are read. */
		warnings: CardWarnings | null;
		onclose: () => void;
	} = $props();
	const tr = $derived(translator(lang));

	let status = $state<'loading' | 'ok' | 'budget' | 'error'>('loading');
	let answer = $state<CardAnswer | null>(null);
	let spots = $state<{ spot: SurfSpotNow; km: number }[]>([]);
	const data = $derived<CardData | null>(answer ? cardData({ name, lang, answer, warnings }) : null);
	const drawsHome = $derived(answer ? cardDrawsHome(answer.point) : false);
	const weather = $derived<Weather | null>(answer ? pointFromApi(answer.point) : null);
	const hasMore = $derived(
		!!weather && (!!weather.air || !!weather.fires || !!weather.drought || spots.length > 0)
	);

	$effect(() => {
		const cell = snapToGrid({ lat, lon });
		status = 'loading';
		answer = null;
		let gone = false;
		fetch(`/data/card.json?lat=${cell.lat}&lon=${cell.lon}`)
			.then(async (r) => {
				if (gone) return;
				if (r.status === 503) status = 'budget';
				else if (!r.ok) status = 'error';
				else {
					answer = (await r.json()) as CardAnswer;
					status = 'ok';
				}
			})
			.catch(() => !gone && (status = 'error'));
		return () => (gone = true);
	});

	$effect(() => {
		spots = [];
		if (!nearSurfSpots({ lat, lon })) return;
		let gone = false;
		fetch('/data/surf.json')
			.then((r) => (r.ok ? (r.json() as Promise<SurfOverview>) : null))
			.then((o) => {
				if (gone || !o) return;
				spots = o.spots
					.map((spot) => ({ spot, km: distanceKm({ lat, lon }, spot) }))
					.filter((s) => s.km <= 30)
					.sort((a, b) => a.km - b.km)
					.slice(0, 3);
			})
			.catch(() => {});
		return () => (gone = true);
	});

	// --- a column of the card's hours under the pointer: its whole hour --------------------------------------------------------
	let body: HTMLDivElement;
	let tip = $state<{ left: number; top: number; lines: [string, string][]; head: string } | null>(null);
	type RawHour = Record<string, number | boolean | null | undefined>;
	const val = (h: RawHour, k: string) => (typeof h[k] === 'number' ? (h[k] as number) : null);

	function columnAt(
		event: PointerEvent
	): { cols: HTMLElement; index: number; n: number; step: number } | null {
		const cols = event
			.composedPath()
			.find((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('cols'));
		if (!cols) return null;
		const hours = [...cols.querySelectorAll('.hr')].map((el) => /(\d{1,2})/.exec(el.textContent ?? '')?.[1]);
		const n = cols.querySelectorAll('.cl').length;
		if (!n || hours.length < 2 || hours.some((h) => h == null)) return null;
		const step = (Number(hours[1]) - Number(hours[0]) + 24) % 24 || 1;
		const rect = cols.getBoundingClientRect();
		const index = Math.floor(((event.clientX - rect.left) / rect.width) * n);
		return index >= 0 && index < n ? { cols, index, n, step } : null;
	}

	function onmove(event: PointerEvent) {
		if (event.pointerType !== 'mouse' || !answer) return void (tip = null);
		const at = columnAt(event);
		const raw = (answer.point as { hourly?: RawHour[]; utc_offset_s?: number } | null) ?? {};
		if (!at || !Array.isArray(raw.hourly)) return void (tip = null);
		const now = Math.floor(Date.now() / 1000);
		const from = now - (now % 3600) + at.index * at.step * 3600;
		const to = from + at.step * 3600;
		const hours = raw.hourly.filter(
			(h) => typeof h.time_utc === 'number' && h.time_utc >= from && h.time_utc < to
		);
		if (!hours.length) return void (tip = null);
		const h0 = hours[0];
		const off = raw.utc_offset_s ?? 0;
		const sum = (k: string) => hours.reduce((a, h) => a + (val(h, k) ?? 0), 0);
		const max = (k: string) => Math.max(...hours.map((h) => val(h, k) ?? -Infinity));
		const codes = hours.map((h) => val(h, 'weather_code')).filter((c): c is number => c != null);
		// A value that rounds to zero is written 0, never -0.
		const n = (v: number | null, d = 0) =>
			v == null || !Number.isFinite(v) ? '–' : number(lang, Number(v.toFixed(d)) || 0, d);
		const chance = max('precipitation_probability_pct');
		const wind = hours.reduce((a, h) => a + (val(h, 'wind_kmh') ?? 0), 0) / hours.length;
		const lines: [string, string][] = [
			[
				tr('towns.col.temp'),
				`${n(val(h0, 'temp_c'))}° (${tr('towns.feels', { t: n(val(h0, 'feels_like_c')) })})`
			],
			[
				tr('towns.col.rain'),
				`${n(sum('precipitation_mm'), 1)} mm${Number.isFinite(chance) && chance > 0 ? ` · ${tr('towns.col.chance', { pct: chance })}` : ''}`
			],
			[
				tr('towns.col.wind'),
				`${n(wind)} km/h ${compass(lang, val(h0, 'wind_deg'))} · ${tr('towns.gusts', { v: n(max('wind_gust_kmh')) })}`
			],
			[
				tr('towns.col.clouds'),
				`${n(val(h0, 'cloud_low_pct'))} / ${n(val(h0, 'cloud_mid_pct'))} / ${n(val(h0, 'cloud_high_pct'))} %`
			],
			[tr('towns.col.dew'), `${n(val(h0, 'dew_point_c'))}° · ${n(val(h0, 'pressure_hpa'))} hPa`]
		];
		const iso0 = val(h0, 'freezing_level_m');
		if (iso0 != null) lines.push([tr('towns.col.iso0'), `${n(iso0)} m`]);
		const box = body.getBoundingClientRect();
		const col = at.cols.getBoundingClientRect();
		const colLeft = col.left + (col.width / at.n) * at.index;
		const width = 250;
		tip = {
			head: `${hourLabel(lang, from, off)} – ${hourLabel(lang, to, off)} · ${skyLabel(lang, codes.length ? Math.max(...codes) : null)}`,
			lines,
			left: Math.max(4, Math.min(colLeft - box.left + col.width / at.n + 6, box.width - width - 4)),
			top: col.bottom - box.top + body.scrollTop + 6
		};
	}

	let closeButton: HTMLButtonElement;
	onMount(() => closeButton?.focus({ preventScroll: true }));
</script>

<section class="townCard" aria-label={tr('towns.cardOf', { name })} data-testid="town-card">
	<header>
		<div>
			<p class="kind">{tr('frame.family.weather')} · <b>{name}</b></p>
			<a class="link" href="/near#{lat.toFixed(3)},{lon.toFixed(3)}">{tr('towns.placePage')}</a>
		</div>
		<button type="button" class="x" bind:this={closeButton} aria-label={tr('towns.close')} onclick={onclose}>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
		</button>
	</header>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="body" bind:this={body} onpointermove={onmove} onpointerleave={() => (tip = null)}>
		{#if status === 'loading'}
			<p class="muted small">{tr('detail.loading')}</p>
		{:else if status === 'budget'}
			<p class="note">{tr('near.weatherBudget')}</p>
		{:else if status === 'error'}
			<p class="note">{tr('near.weatherFailed')}</p>
		{/if}
		{#if data && drawsHome}
			<div class="card"><HomeCard {name} {lang} {dark} {data} /></div>
		{:else if weather}
			<div class="own" data-testid="town-card-own">
				<PointWeather {lang} {weather} parts={['now', 'rain', 'charts', 'days']} />
			</div>
		{/if}
		{#if weather && hasMore}
			<div class="more">
				<PointWeather {lang} {weather} parts={['air', 'fires', 'drought']} />
				{#if spots.length}
					<section class="part">
						<h3>{tr('towns.spots')}</h3>
						{#each spots as s (s.spot.id)}<SurfSpotRow {lang} spot={s.spot} km={s.km} />{/each}
					</section>
				{/if}
			</div>
		{/if}
		{#if tip}
			<div class="coltip" style:left="{tip.left}px" style:top="{tip.top}px" role="tooltip">
				<b>{tip.head}</b>
				{#each tip.lines as [k, v] (k)}<div class="l"><span>{k}</span><span>{v}</span></div>{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.townCard {
		position: absolute;
		z-index: 7;
		top: 10px;
		right: 10px;
		bottom: 10px;
		width: min(452px, calc(100% - 20px));
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px 8px 14px;
		border-bottom: 1px solid var(--line);
	}
	.kind {
		margin: 0;
		color: var(--muted);
		font: 600 12px/1.3 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.kind b {
		color: var(--ink);
		font: 700 17px/1.2 var(--font-display);
		text-transform: none;
		letter-spacing: 0;
	}
	.link {
		font-size: 13px;
	}
	.link::after {
		content: ' ›';
	}
	.x {
		flex: none;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.x svg {
		width: 14px;
		height: 14px;
		stroke: currentColor;
		stroke-width: 2;
		fill: none;
		stroke-linecap: round;
	}
	.body {
		position: relative;
		flex: 1;
		overflow-y: auto;
		padding: 0 0 12px;
	}
	.body > p {
		margin: 14px;
	}
	.card {
		min-height: 200px;
	}
	.own {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 12px 0;
	}
	.own :global(.part) {
		margin: 0;
	}
	.more {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 12px 0;
	}
	.more :global(.part) {
		margin: 0;
	}
	.more h3 {
		margin: 0 0 4px;
		font-size: 15px;
	}
	.coltip {
		position: absolute;
		z-index: 2;
		width: 250px;
		padding: 8px 10px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
		font: 400 12px/1.35 var(--font-body);
		pointer-events: none;
	}
	.coltip b {
		display: block;
		margin-bottom: 4px;
		font-size: 13px;
	}
	.coltip .l {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.coltip .l span:first-child {
		color: var(--muted);
	}
	/* A phone: a sheet from the bottom, over the lower part of the map. */
	@media (max-width: 899px) {
		/* A sheet over the page, from the bottom of the screen: the map is too short on a phone for the whole card. */
		.townCard {
			position: fixed;
			z-index: 40;
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			height: min(78dvh, 680px);
			border-radius: 18px 18px 0 0;
			border-bottom: 0;
		}
		.townCard::before {
			content: '';
			display: block;
			width: 40px;
			height: 5px;
			margin: 7px auto 0;
			border-radius: 3px;
			background: var(--line);
		}
		header {
			padding-top: 4px;
		}
	}
</style>
