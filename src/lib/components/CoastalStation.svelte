<script lang="ts">
	// Latest 6-minute observation from the nearest Météo-France coastal weather station (`GET /v1/surf/spots/{id}/station`)
	// with optional forecast wind comparison. Displays fallback messages honestly when unavailable or unconfigured.
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { WindUnit } from '#lib/sea/choice.js';
	import { apiSentence } from '#lib/sea/text.js';
	import {
		stationSpeedDiffText,
		stationText,
		stationWindText,
		windModelLabel,
		type SpotStationReading
	} from '#lib/stations.js';
	import { compass, hourLabel, surfText } from '#lib/surf.js';

	let {
		lang,
		station = null,
		windUnit = 'kmh'
	}: {
		lang: Lang;
		station: SpotStationReading | null;
		windUnit?: WindUnit;
	} = $props();

	const t = (key: Parameters<typeof stationText>[1], vars?: Record<string, string | number>) =>
		stationText(lang, key, vars);
	const m = $derived(station?.measure ?? null);
	const c = $derived(station?.comparison ?? null);
	const km = (v: number) => number(lang, v, 0);
	const maxKm = $derived(station?.maxComparableKm != null ? number(lang, station.maxComparableKm, 0) : '25');
</script>

<section class="card station" aria-labelledby="coastal-station-heading">
	<h2 id="coastal-station-heading">{t('title')}</h2>

	{#if !station || station.status === 'unavailable'}
		<p class="muted small">{t('unavailable')}</p>
	{:else}
		{#if station.station}
			<p class="small">
				{#if station.distanceKm != null}
					{station.station.commune &&
					station.station.commune.toLowerCase() !== station.station.name.toLowerCase()
						? t('stationAtCommune', {
								name: station.station.name,
								commune: station.station.commune,
								km: km(station.distanceKm)
							})
						: t('stationAt', { name: station.station.name, km: km(station.distanceKm) })}
				{:else}
					{station.station.name}
				{/if}
				{' '}{station.comparable ? t('comparable', { max: maxKm }) : t('tooFar', { max: maxKm })}
			</p>
		{/if}

		{#if station.status === 'not_configured'}
			<p class="muted small">{t('notConfigured')}</p>
		{:else if station.status === 'no_current_reading'}
			<p class="muted small">
				{t('noCurrentReading', {
					hours: station.maxAgeHours != null ? number(lang, station.maxAgeHours, 0) : '1'
				})}
			</p>
		{:else if station.status === 'ok' && m}
			{#if station.stale}
				<p class="note small">{t('stale')}</p>
			{/if}

			{#if m.measuredUtc != null && m.ageMinutes != null}
				<p class="muted small">
					{t('measuredAt', { time: hourLabel(lang, m.measuredUtc), age: number(lang, m.ageMinutes, 0) })}
				</p>
			{:else if m.ageMinutes != null}
				<p class="muted small">{t('measuredAge', { age: number(lang, m.ageMinutes, 0) })}</p>
			{/if}

			<div class="figs">
				{#if m.windSpeedKmh != null}
					<div>
						<p class="fig data">
							{stationWindText(lang, m.windSpeedKmh, windUnit)}{#if m.windFromDeg != null}
								{' '}{compass(lang, m.windFromDeg)} ({number(lang, m.windFromDeg, 0)}°){/if}
						</p>
						<span>
							{t('wind')}{#if m.windRelative}
								· {surfText(lang, `relative.${m.windRelative}`)}{/if}
						</span>
					</div>
				{/if}
				{#if m.windGustKmh != null}
					<div>
						<p class="fig data">{stationWindText(lang, m.windGustKmh, windUnit)}</p>
						<span>{t('gusts')}</span>
					</div>
				{/if}
				{#if m.airTempC != null}
					<div>
						<p class="fig data">{number(lang, m.airTempC, 1)} °C</p>
						<span>{t('temp')}</span>
					</div>
				{/if}
				{#if m.humidityPct != null}
					<div>
						<p class="fig data">{number(lang, m.humidityPct, 0)} %</p>
						<span>{t('humidity')}</span>
					</div>
				{/if}
				{#if m.pressureHpa != null}
					<div>
						<p class="fig data">{number(lang, m.pressureHpa, 1)} hPa</p>
						<span>{t('pressure')}</span>
					</div>
				{/if}
				{#if m.precip6mMm != null}
					<div>
						<p class="fig data">{number(lang, m.precip6mMm, 1)} mm</p>
						<span>{t('precip')}</span>
					</div>
				{/if}
			</div>

			{#if c}
				<div class="comp">
					<h3>{t('compareTitle')}</h3>
					{#if c.status === 'ok'}
						<p class="small">
							{#if c.windModel && c.forecastTimeUtc != null}
								{t('compareModel', {
									model: windModelLabel(lang, c.windModel),
									time: hourLabel(lang, c.forecastTimeUtc)
								})} ·
							{/if}
							{#if c.modelWindSpeedKmh != null}
								<span class="data">{stationWindText(lang, c.modelWindSpeedKmh, windUnit)}</span>
								{#if c.modelWindFromDeg != null}
									{' '}<span class="data">{compass(lang, c.modelWindFromDeg)}</span>
								{/if}
								{#if c.modelWindRelative}
									({surfText(lang, `relative.${c.modelWindRelative}`)})
								{/if}
							{/if}
						</p>
						<p class="small">
							{#if c.speedDiffKmh != null}
								{t('compareDiff')} :
								<span class="data">{stationSpeedDiffText(lang, c.speedDiffKmh, windUnit)}</span>
							{/if}
							{#if c.directionDiffDeg != null}
								{' · '}{t('compareDir', { deg: number(lang, c.directionDiffDeg, 0) })}
							{/if}
							{#if c.regimeMatch != null}
								{' · '}{t(c.regimeMatch ? 'regimeSame' : 'regimeDifferent')}
							{/if}
						</p>
					{:else if c.status === 'no_matching_hour'}
						<p class="muted small">{t('compareNoHour')}</p>
					{:else}
						<p class="muted small">{t('compareUnavailable')}</p>
					{/if}
				</div>
			{/if}
		{/if}

		{#if station.derived.length}
			<p class="muted small">{t('derivedNote')}</p>
		{/if}
		{#if station.note}
			{@const said = apiSentence(lang, station.note)}
			{#if lang === 'en'}<p class="muted small" lang={said.lang}>{said.text}</p>{/if}
		{/if}
	{/if}
</section>

<style>
	.station h2 {
		margin: 0 0 6px;
	}
	.station h3 {
		margin: 10px 0 4px;
		font-size: 15px;
	}
	.figs {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 22px;
		margin: 8px 0;
	}
	.figs > div {
		display: flex;
		flex-direction: column;
	}
	.fig {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.15;
	}
	.figs span {
		font-size: 12.5px;
		color: var(--muted);
	}
	.comp {
		border-top: 1px solid var(--line);
		margin-top: 8px;
		padding-top: 4px;
	}
	p {
		margin: 4px 0;
	}
</style>
