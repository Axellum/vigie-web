<script lang="ts">
	// "Is it normal?" (`GET /v1/climate/normals`): `summary` is the line of the day against the normal of the month and a gauge
	// from the cold record to the heat record; `details` is the table of the month at the station, with the records and their
	// day. The values are the station's sheet as Météo-France publishes it; the difference and "record beaten" are computed here
	// by the API's rule (ADR 0027 of the API). Nothing is shown that the sheet does not give.
	import { calendarDay, number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import {
		climateDay,
		climateText,
		gaugeAt,
		monthName,
		monthOf,
		stationName,
		type ClimateRecord,
		type ClimateResponse,
		type ClimateValue
	} from '#lib/climate.js';
	import { speed, speedLabel, temperature, temperatureLabel, type Units } from '#lib/units.js';

	let {
		lang,
		units,
		value,
		tmax,
		tmin,
		part
	}: {
		lang: Lang;
		units: Units;
		value: ClimateResponse & {
			station: NonNullable<ClimateResponse['station']>;
			normals: NonNullable<ClimateResponse['normals']>;
			records: NonNullable<ClimateResponse['records']>;
		};
		tmax: number | null;
		tmin: number | null;
		part: 'summary' | 'details';
	} = $props();

	const n = $derived(value.normals);
	const r = $derived(value.records);
	const month = $derived(monthOf(lang, value.month));
	const day = $derived(climateDay(value, tmax, tmin));
	// Figures in the reader's unit: a temperature, and a difference of temperatures (a degree F is 5/9 of a degree C).
	const deg = (c: number | null) => (c == null ? '–' : number(lang, temperature(c, units.temperature), 0));
	const withUnit = (c: number | null, digits = 1) =>
		c == null
			? '–'
			: `${number(lang, temperature(c, units.temperature), digits)} ${temperatureLabel(units.temperature)}`;
	const diffDeg = (d: number) => Math.round(Math.abs(units.temperature === 'f' ? (d * 9) / 5 : d));
	const year = (rec: ClimateRecord) => rec.date?.slice(0, 4) ?? '–';

	const lo = $derived(gaugeAt(r, n.tmin.value));
	const hi = $derived(gaugeAt(r, n.tmax.value));
	const mark = $derived(gaugeAt(r, tmax));
	const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

	const dayLine = $derived.by(() => {
		if (!day || tmax == null) {
			return climateText(lang, 'noDay', { month, min: deg(n.tmin.value), max: deg(n.tmax.value) });
		}
		const d = diffDeg(day.difference);
		const vars = { value: withUnit(tmax, 0), diff: d, month };
		if (d === 0) return climateText(lang, 'same', vars);
		return climateText(lang, day.difference > 0 ? 'above' : 'below', vars);
	});

	const row = (label: string, v: ClimateValue, fmt: (x: number) => string) => ({
		label,
		value: v.value == null ? '–' : fmt(v.value)
	});
	const rows = $derived([
		{
			...row(climateText(lang, 'tmax'), n.tmax, (x) => withUnit(x)),
			note:
				r.tmax.value != null
					? climateText(lang, 'recordOn', {
							value: withUnit(r.tmax.value),
							date: calendarDay(lang, r.tmax.date)
						})
					: ''
		},
		{
			...row(climateText(lang, 'tmin'), n.tmin, (x) => withUnit(x)),
			note:
				r.tmin.value != null
					? climateText(lang, 'recordOn', {
							value: withUnit(r.tmin.value),
							date: calendarDay(lang, r.tmin.date)
						})
					: ''
		},
		{
			...row(climateText(lang, 'rain'), n.rain, (x) => `${number(lang, x, 0)} mm`),
			note:
				r.rainDay.value != null
					? climateText(lang, 'recordRain', {
							value: `${number(lang, r.rainDay.value, 1)} mm`,
							date: calendarDay(lang, r.rainDay.date)
						})
					: ''
		},
		{
			...row(climateText(lang, 'rainDays'), n.rainDays, (x) =>
				climateText(lang, 'days', { n: number(lang, x, 0) })
			),
			note: ''
		},
		{
			...row(climateText(lang, 'frostDays'), n.frostDays, (x) =>
				climateText(lang, 'days', { n: number(lang, x, 1) })
			),
			note: ''
		},
		{
			...row(climateText(lang, 'hotDays'), n.hotDays, (x) =>
				climateText(lang, 'days', { n: number(lang, x, 1) })
			),
			note: ''
		},
		{
			...row(climateText(lang, 'sunshine'), n.sunshine, (x) =>
				climateText(lang, 'hours', { n: number(lang, x, 0) })
			),
			note: ''
		}
	]);
	// The records count from the station's opening, which the sheet dates: a station opened in 2015 has ten years of them.
	const since = $derived(r.tmax.since ? r.tmax.since.slice(0, 4) : climateText(lang, 'sinceOpening'));
	const period = $derived(n.tmax.period ?? n.tmean.period ?? '1991-2020');
</script>

{#if part === 'summary'}
	<p class="line" class:above={day && diffDeg(day.difference) > 0 && day.difference > 0}>{dayLine}</p>
	{#if day?.record}
		<p class="record">{climateText(lang, day.record === 'heat' ? 'recordHeat' : 'recordCold')}</p>
	{/if}
	{#if lo != null && hi != null}
		<div class="gauge" role="img" aria-label={climateText(lang, 'gaugeLabel')}>
			<span class="track"></span>
			<span class="band" style:left={pct(lo)} style:width={pct(Math.max(0.01, hi - lo))}></span>
			{#if mark != null}
				<span class="mark" class:warm={day != null && day.difference > 0} style:left={pct(mark)}></span>
			{/if}
		</div>
		<div class="ends small muted">
			<span>{climateText(lang, 'gaugeCold', { value: `${deg(r.tmin.value)}°`, year: year(r.tmin) })}</span>
			<span class="mid"
				>{climateText(lang, 'gaugeNormals', { min: deg(n.tmin.value), max: deg(n.tmax.value) })}</span
			>
			<span class="right"
				>{climateText(lang, 'gaugeHeat', { value: `${deg(r.tmax.value)}°`, year: year(r.tmax) })}</span
			>
		</div>
	{/if}
{:else}
	{@const s = value.station}
	{@const name = stationName(s.name)}
	<h4>{climateText(lang, 'heading', { month: monthName(lang, value.month), station: name })}</h4>
	<p class="small muted">
		{climateText(lang, 'station', {
			name,
			km: number(lang, s.distanceKm, s.distanceKm < 10 ? 1 : 0),
			alt: s.altitudeM
		})}
	</p>
	<table class="small">
		<tbody>
			{#each rows as row (row.label)}
				{#if row.value !== '–' || row.note}
					<tr>
						<th scope="row">{row.label}</th>
						<td>
							<span class="data">{row.value}</span>
							{#if row.note}<span class="rec muted">{row.note}</span>{/if}
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
	{#if r.gust.value != null}
		<p class="small muted">
			{climateText(lang, 'recordGust', {
				value: `${number(lang, speed(r.gust.value * 3.6, units.wind), 0)} ${speedLabel(lang, units.wind)}`,
				date: calendarDay(lang, r.gust.date)
			})}
		</p>
	{/if}
	{#if !s.active && s.recordsUntil}
		<p class="small muted">{climateText(lang, 'stopped', { date: calendarDay(lang, s.recordsUntil) })}</p>
	{/if}
	<p class="small muted">{climateText(lang, 'period', { period, since })}</p>
	<p class="small muted">{climateText(lang, 'altitude')}</p>
{/if}

<style>
	p {
		margin: 0;
	}
	.line.above {
		color: var(--sev-orange);
	}
	.record {
		font-weight: 600;
		color: var(--sev-red);
	}
	.gauge {
		position: relative;
		height: 22px;
		margin-top: 4px;
	}
	.track {
		position: absolute;
		top: 8px;
		left: 0;
		right: 0;
		height: 6px;
		border-radius: 3px;
		background: var(--line);
	}
	.band {
		position: absolute;
		top: 6px;
		height: 10px;
		border-radius: 3px;
		background: var(--accent-soft);
		border: 1px solid var(--accent);
	}
	.mark {
		position: absolute;
		top: 0;
		width: 3px;
		height: 22px;
		margin-left: -1px;
		border-radius: 1px;
		background: var(--accent);
	}
	.mark.warm {
		background: var(--sev-orange);
	}
	.ends {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 8px;
	}
	.ends .mid {
		text-align: center;
	}
	.ends .right {
		text-align: right;
	}
	h4 {
		margin: 0;
		font-size: 15px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 4px 8px 4px 0;
		border-top: 1px solid var(--line);
		text-align: left;
		font-weight: 400;
		vertical-align: top;
	}
	th {
		width: 45%;
	}
	.data {
		white-space: nowrap;
	}
	/* The record goes under the value: the card can be a narrow column of the wide page. */
	.rec {
		display: block;
	}
</style>
