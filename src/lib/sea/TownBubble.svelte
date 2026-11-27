<script lang="ts">
	// The card of a town on the sea map, opened by its name on the base map: the weather of its grid point (now and the next hour as
	// on the weather tab of a spot, then five days in a strip that fits the card, then the air, the fires seen by satellite and the
	// drought), the spots nearest to it with their verdict and the figures of the hour for the activity chosen (a click opens the
	// spot's card), and the way to the whole page of the place. In the slot of the card of a spot: beside the map on a computer, a
	// sheet at the bottom of the screen on a phone. Every figure is the API's; what it did not give is left out. Not for safety.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Credits from '#lib/components/Credits.svelte';
	import PointWeather from '#lib/components/PointWeather.svelte';
	import { number } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import { placeHash, snapToGrid } from '#lib/near.js';
	import type { PointWeather as Weather } from '#lib/types.js';
	import { skyLabel } from '#lib/weather.js';
	import type { SeaPin } from './map.js';
	import { seaText } from './text.js';
	import { NEAREST_MAX_KM, nearestPins, type Town } from './town.js';
	import VerdictChip from './VerdictChip.svelte';

	let {
		lang,
		town,
		pins,
		onspot,
		onclose
	}: {
		lang: Lang;
		town: Town;
		/** The pins of the map: the spots nearest to the town come with the verdict and the figures their pin shows. */
		pins: SeaPin[];
		onspot: (id: string) => void;
		onclose: () => void;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);

	let weather = $state<
		{ status: 'loading' } | { status: 'failed' } | { status: 'budget' } | { status: 'ok'; value: Weather }
	>({ status: 'loading' });
	// The weather of the grid point of the town (about 5 km). The page makes the card again for another town.
	onMount(() => {
		const point = snapToGrid(town);
		void (async () => {
			try {
				const response = await fetch(`/data/point.json?lat=${point.lat}&lon=${point.lon}`);
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
		})();
	});

	const near = $derived(nearestPins(pins, town));
	const km = (d: number) => t('away', { km: number(lang, d, d < 10 ? 1 : 0) });

	// Five days, as on the page of the place but in a strip: the day, its sky, the highest and lowest temperatures, the rain.
	const tr = $derived(translator(lang));
	const days = $derived(weather.status === 'ok' ? weather.value.daily.slice(0, 5) : []);
	const dayName = (date: string) =>
		new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
			weekday: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(`${date}T12:00:00Z`));
	const deg = (c: number | null) => (c == null ? '–' : `${Math.round(c)}°`);
	// The page of the place, with the town's name (the page reads it from the navigation, as after a search).
	const hash = $derived(placeHash(town, 300));
	function toPlace(event: MouseEvent) {
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		void goto('/near' + hash, { state: { searchedPlace: { hash, label: town.name } } });
	}
</script>

<section class="bubble" aria-labelledby="town-bubble-title" data-testid="town-bubble">
	<header class="head">
		<div>
			<p class="kind">{t('town.kind')}</p>
			<h2 id="town-bubble-title">{town.name}</h2>
		</div>
		<button type="button" class="close" aria-label={t('town.close')} onclick={onclose}>
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
		</button>
	</header>

	<div class="body">
		{#if weather.status === 'ok'}
			<PointWeather {lang} weather={weather.value} parts={['now', 'rain']} />
			{#if days.length}
				<section class="days" aria-labelledby="town-days-title">
					<h3 id="town-days-title">{tr('w.days')}</h3>
					<ol style:grid-template-columns="repeat({days.length}, minmax(0, 1fr))">
						{#each days as d (d.date)}
							<li>
								<b>{dayName(d.date)}</b>
								<span class="sky" title={skyLabel(lang, d.code)}>{skyLabel(lang, d.code)}</span>
								<span class="temps"><strong>{deg(d.tmaxC)}</strong> <span>{deg(d.tminC)}</span></span>
								{#if d.rainMm != null && d.rainMm >= 0.1}
									<span class="rain">{number(lang, d.rainMm, d.rainMm < 10 ? 1 : 0)} mm</span>
								{:else if d.rainMm != null}
									<span class="muted">{t('town.dry')}</span>
								{/if}
							</li>
						{/each}
					</ol>
					<p class="muted small">{tr('w.daysNote')}</p>
				</section>
			{/if}
		{:else if weather.status === 'budget'}
			<p class="note">{t('weather.budget')}</p>
		{:else if weather.status === 'failed'}
			<p class="note">{t('town.failed')}</p>
		{:else}
			<p class="muted">{t('town.loading')}</p>
		{/if}

		<section class="spots" aria-labelledby="town-spots-title" data-testid="town-spots">
			<h3 id="town-spots-title">{t('town.spots')}</h3>
			<p class="muted small">{t('town.spotsHint')}</p>
			{#if near.length}
				<ul>
					{#each near as { pin, km: d } (pin.id)}
						<li>
							<button type="button" class="spot" onclick={() => onspot(pin.id)}>
								<span class="name">
									<strong>{pin.name}</strong>
									<span class="muted small">{[km(d), pin.text, pin.wind].filter(Boolean).join(' · ')}</span>
								</span>
								<VerdictChip {lang} verdict={pin.verdict} />
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted small">{t('town.noSpot', { km: NEAREST_MAX_KM })}</p>
			{/if}
		</section>

		{#if weather.status === 'ok'}
			<PointWeather {lang} weather={weather.value} parts={['air', 'fires', 'drought']} />
		{/if}

		<a class="more" href="/near{hash}" onclick={toPlace} data-testid="town-more">{t('town.more')}</a>

		{#if weather.status === 'ok'}
			<Credits
				{lang}
				credits={[
					weather.value.attribution,
					weather.value.rain?.attribution,
					weather.value.air?.attribution,
					weather.value.fires?.attribution
				]}
			/>
		{/if}
	</div>
</section>

<style>
	/* The chrome of the card of a spot (`SpotBubble.svelte`), without its tabs. */
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
		padding: 14px 14px 10px 16px;
		border-bottom: 1px solid var(--line);
	}
	.kind {
		margin: 0 0 2px;
		color: var(--muted);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.head h2 {
		margin: 0;
		font-size: 20px;
		line-height: 1.2;
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
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
		margin: 0;
	}
	.spots h3 {
		margin: 4px 0 0;
		font-size: 15px;
	}
	.spots > p {
		margin: 0 0 6px;
	}
	.spots ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.spot {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.spot:hover {
		border-color: var(--accent);
	}
	.name {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.more {
		font-weight: 600;
	}
	.days h3 {
		margin: 0 0 6px;
		font-size: 15px;
	}
	.days ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.days li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 8px 4px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		text-align: center;
		font-size: 13px;
		min-width: 0;
	}
	.days .sky {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.25;
		min-height: 2.5em;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.days .temps strong {
		font-size: 16px;
	}
	.days .temps span {
		color: var(--muted);
	}
	.days .rain {
		color: var(--accent);
		font-weight: 600;
	}
	.days p {
		margin: 6px 0 0;
	}
</style>
