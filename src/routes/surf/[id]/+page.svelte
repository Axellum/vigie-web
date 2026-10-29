<script lang="ts">
	// The forecast of one spot for the next three days, as the API worked it out: the best slot first, with its rating
	// explained criterion by criterion, then every daylight hour (the night ones on demand), each one opening on its rating.
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import {
		compass,
		criterionValue,
		dayLabel,
		hourLabel,
		hoursByDay,
		share,
		surfText,
		swellText,
		windText,
		type SurfHour,
		type SurfRating
	} from '#lib/surf.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const f = $derived(data.forecast);
	let night = $state(false);
	const days = $derived(f ? hoursByDay(f.hours, night) : []);
	const fmt = (v: number, digits = 1) =>
		v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: digits });
	const tideText = (h: SurfHour) =>
		h.tide
			? `${h.tide.height >= 0 ? '+' : ''}${fmt(h.tide.height, 2)} m · ${surfText(lang, `trend.${h.tide.trend}`)}`
			: null;
</script>

<Seo
	title={f
		? `${surfText(lang, 'page')} · ${f.spot.name}${f.spot.place ? `, ${f.spot.place}` : ''}`
		: surfText(lang, 'page')}
	description={surfText(lang, 'pageIntro')}
/>

{#snippet bar(r: SurfRating | null)}
	{#if r}
		<span class="score" title={surfText(lang, 'points', { points: r.points, outOf: r.outOf })}>
			<span class="meter" aria-hidden="true"><span style:width="{(share(r) ?? 0) * 100}%"></span></span>
			<span class="data">{r.points}/{r.outOf}</span>
		</span>
	{:else}
		<span class="muted small">{surfText(lang, 'noRating')}</span>
	{/if}
{/snippet}

{#snippet why(r: SurfRating)}
	<ul class="criteria">
		{#each r.criteria as c (c.name)}
			<li>
				<span class="name">{surfText(lang, `criterion.${c.name}`)}</span>
				<span class="data">{criterionValue(lang, c) ?? surfText(lang, 'unknownValue')}</span>
				<span class="data pts">{c.points == null ? surfText(lang, 'notScored') : `${c.points}/${c.max}`}</span
				>
				{#if f?.rules[c.name]}<span class="rule muted small">{f.rules[c.name]}</span>{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<div class="page">
	<header class="intro">
		<p class="small"><a href="/surf">← {surfText(lang, 'back')}</a></p>
		{#if f}
			<h1>{f.spot.name}</h1>
			<p class="muted">
				{#if f.spot.place}{f.spot.place} ·
				{/if}{surfText(lang, 'facing', {
					dir: compass(lang, f.spot.facing),
					deg: f.spot.facing
				})}
			</p>
		{:else}
			<h1>{surfText(lang, 'page')}</h1>
		{/if}
		<p class="note">{surfText(lang, 'safety')}</p>
	</header>

	{#if !f}
		<p class="note">{surfText(lang, 'unavailable')}</p>
	{:else}
		<section class="card best">
			<h2>{surfText(lang, 'best')}</h2>
			{#if f.best}
				<p class="when">
					<strong>{dayLabel(lang, f.best.t)}, {hourLabel(lang, f.best.t)}</strong>
					{@render bar(f.best.rating)}
				</p>
				{@const hour = f.hours.find((h) => h.t === f.best?.t)}
				{#if hour}
					<p class="figs">
						{#if swellText(lang, hour.swell)}<span
								><b>{surfText(lang, 'swell')}</b> {swellText(lang, hour.swell)}</span
							>{/if}
						{#if windText(lang, hour.wind)}<span
								><b>{surfText(lang, 'wind')}</b>
								{windText(lang, hour.wind)}{#if hour.wind.relative}, {surfText(
										lang,
										`relative.${hour.wind.relative}`
									)}{/if}</span
							>{/if}
						{#if tideText(hour)}<span><b>{surfText(lang, 'tide')}</b> {tideText(hour)}</span>{/if}
					</p>
				{/if}
				<h3>{surfText(lang, 'why')}</h3>
				{@render why(f.best.rating)}
				<p class="muted small">
					{surfText(lang, 'ours')}{#if f.rules.best_slot}
						{' '}{f.rules.best_slot}.{/if}
				</p>
			{:else}
				<p class="muted">{surfText(lang, 'bestNone')}</p>
			{/if}
		</section>

		<section class="block">
			<h2>{surfText(lang, 'hours')}</h2>
			<p class="muted small">{surfText(lang, 'hoursNote')}</p>
			<label class="small"><input type="checkbox" bind:checked={night} /> {surfText(lang, 'showNight')}</label
			>
			{#each days as day (day.key)}
				<h3 class="day">{dayLabel(lang, day.t)}</h3>
				<div class="hours">
					{#each day.hours as h (h.t)}
						<details class="hour" class:night={h.daylight === false} class:top={h.t === f.best?.t}>
							<summary>
								<span class="data t">{hourLabel(lang, h.t)}</span>
								<span class="sw">{swellText(lang, h.swell) ?? '—'}</span>
								<span class="wd"
									>{windText(lang, { ...h.wind, gust: null }) ?? '—'}{#if h.wind.relative}
										<span class="muted small">{surfText(lang, `relative.${h.wind.relative}`)}</span
										>{/if}</span
								>
								<span class="rt">{@render bar(h.rating)}</span>
							</summary>
							<div class="more">
								<p class="figs">
									{#if swellText(lang, h.secondary)}<span
											><b>{surfText(lang, 'secondary')}</b> {swellText(lang, h.secondary)}</span
										>{/if}
									{#if h.power != null}<span><b>{surfText(lang, 'power')}</b> {fmt(h.power)} kW/m</span>{/if}
									{#if h.wind.gust != null}<span
											><b>{surfText(lang, 'gusts')}</b> {fmt(h.wind.gust, 0)} km/h</span
										>{/if}
									{#if tideText(h)}<span
											><b>{surfText(lang, 'tide')}</b>
											{tideText(h)}{#if h.tide?.stage}, {surfText(lang, `stage.${h.tide.stage}`)}{/if}</span
										>{/if}
								</p>
								{#if h.rating}{@render why(h.rating)}{/if}
							</div>
						</details>
					{/each}
				</div>
			{/each}
		</section>

		<section class="block">
			{#if f.model}<p class="muted small">{surfText(lang, 'model', { model: f.model })}</p>{/if}
			<p class="muted small">
				{surfText(lang, 'updated', {
					time: `${dayLabel(lang, f.generated)}, ${hourLabel(lang, f.generated)}`
				})}
			</p>
			{#if f.limits}
				<details class="limits">
					<summary class="small">{surfText(lang, 'limits')}</summary>
					<p class="small" lang="en">{f.limits}</p>
				</details>
			{/if}
		</section>
	{/if}

	<Credits {lang} credits={[f?.attribution]} />
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
	.best h2 {
		margin: 0 0 8px;
	}
	h3 {
		margin: 12px 0 6px;
		font-size: 16px;
	}
	.day::first-letter {
		text-transform: uppercase;
	}
	.when {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		margin: 0 0 6px;
	}
	.figs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 0 0 6px;
	}
	.score {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.meter {
		display: inline-block;
		width: 56px;
		height: 8px;
		border-radius: 4px;
		background: var(--line);
		overflow: hidden;
	}
	.meter span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.criteria {
		list-style: none;
		padding: 0;
		margin: 0 0 6px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.criteria li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 2px 12px;
		align-items: baseline;
	}
	.criteria .rule {
		grid-column: 1 / -1;
	}
	.pts {
		min-width: 3.5em;
		text-align: right;
	}
	.hours {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.hour {
		border-bottom: 1px solid var(--line);
	}
	.hour.top {
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.hour.night summary {
		opacity: 0.7;
	}
	.hour summary {
		display: grid;
		grid-template-columns: 3.2em minmax(0, 1.2fr) minmax(0, 1.2fr) auto;
		gap: 8px;
		align-items: center;
		padding: 6px 4px;
		cursor: pointer;
		list-style: none;
	}
	.hour summary::-webkit-details-marker {
		display: none;
	}
	.hour .more {
		padding: 4px 4px 10px 3.6em;
	}
	@media (max-width: 560px) {
		.hour summary {
			grid-template-columns: 3em minmax(0, 1fr) auto;
		}
		.hour summary .wd {
			grid-column: 2 / 3;
			grid-row: 2;
		}
		.hour summary .rt {
			grid-column: 3;
			grid-row: 1 / 3;
		}
		.hour .more {
			padding-left: 4px;
		}
	}
	.limits summary {
		cursor: pointer;
		color: var(--muted);
	}
</style>
