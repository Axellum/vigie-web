<script lang="ts">
	// The weather of one grid point (`/v1/point`): now, the next hour, the next days, air, river, fires seen by
	// satellite, sea, space.
	// Every value comes from the API as it is; an unknown one shows "–", a block the API did not give is left out.
	import DroughtPanel from '#lib/components/DroughtPanel.svelte';
	import Time from '#lib/components/Time.svelte';
	import { ensembleView, hourLabel, percent } from '#lib/ensemble.js';
	import { number } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import { placeFormat } from '#lib/placeFormat.js';
	import type { PointWeather } from '#lib/types.js';
	import { DEFAULT_UNITS, type Units } from '#lib/units.js';
	import { compass, skyLabel } from '#lib/weather.js';

	type Part =
		'now' | 'rain' | 'ensemble' | 'days' | 'air' | 'river' | 'fires' | 'marine' | 'space' | 'drought';
	const ALL: Part[] = [
		'now',
		'rain',
		'ensemble',
		'days',
		'air',
		'river',
		'fires',
		'marine',
		'space',
		'drought'
	];

	// `parts`: the blocks to show, so that the cards of a place can each hold their own.
	let {
		lang,
		weather,
		parts = ALL,
		units = DEFAULT_UNITS
	}: { lang: Lang; weather: PointWeather & { stale?: boolean }; parts?: Part[]; units?: Units } = $props();
	const fmt = $derived(placeFormat(lang, units));
	const show = (part: Part) => parts.includes(part);
	const tr = $derived(translator(lang));
	const LOCALE = { fr: 'fr-FR', en: 'en-GB' } as const;

	const day = (date: string) =>
		new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(
			new Date(`${date}T12:00:00Z`)
		);
	const unit = (value: number | null, u: string, digits = 1) =>
		value == null ? '–' : `${number(lang, value, digits)} ${u}`;
	const current = $derived(weather.current);
	const steps = $derived(weather.rain?.mmPerStep ?? null);
	const stepMax = $derived(steps ? Math.max(0.1, ...steps) : 0.1);

	// What the AROME-PI model forecasts for the next hours: one line per signal, nothing when it forecasts none.
	// A model forecast, not a warning: the wording says so.
	const PRECIPITATION_LINE = {
		freezing: 'w.st.type.freezing',
		snow: 'w.st.type.snow',
		wet_snow: 'w.st.type.wet_snow',
		rain_snow: 'w.st.type.rain_snow',
		ice_pellets: 'w.st.type.ice_pellets',
		snow_pellets: 'w.st.type.snow_pellets',
		hail: 'w.st.type.hail'
	} as const;
	const shortTermLines = $derived.by(() => {
		const s = weather.shortTerm;
		if (!s) return [];
		const lines: { text: string; at: number | null }[] = [];
		if (s.gust.level !== 'none' && s.gust.maxKmh != null) {
			lines.push({ text: tr(`w.st.gust.${s.gust.level}`, { v: fmt.wind(s.gust.maxKmh) }), at: s.gust.at });
		}
		if (s.hail.level !== 'none') lines.push({ text: tr(`w.st.hail.${s.hail.level}`), at: s.hail.at });
		if (s.visibility.level !== 'none' && s.visibility.minM != null) {
			lines.push({
				text: tr(`w.st.vis.${s.visibility.level}`, { v: number(lang, s.visibility.minM, 0) }),
				at: s.visibility.at
			});
		}
		for (const span of s.precipitation) {
			const key = PRECIPITATION_LINE[span.kind as keyof typeof PRECIPITATION_LINE];
			if (key) lines.push({ text: tr(key), at: span.first });
		}
		return lines;
	});

	// The ensemble forecast: bars of the next 24 hours and a few chips, in the hours of the place. Nothing without it.
	const ensemble = $derived(ensembleView(weather.probabilities, weather.utcOffsetS));
	const CHIP_KEY = {
		rain5: 'w.ens.rain5',
		gust: 'w.ens.gust',
		storm: 'w.ens.storm',
		hail: 'w.ens.hail',
		snow: 'w.ens.snow'
	} as const;
	// The gust threshold of the model, 30 knots, in the reader's wind unit.
	const GUST_THRESHOLD_KMH = 30 * 1.852;
</script>

<div class="weather">
	{#if weather.stale && show('now')}
		<p class="note">{tr('near.weatherStale')}</p>
	{/if}

	{#if current && show('now')}
		<div class="now card">
			<div class="headline">
				<span class="temp data">{fmt.temp(current.tempC)}</span>
				<span class="sky">
					<span class="muted small">{tr('w.now')}</span>
					<strong>{skyLabel(lang, current.code)}</strong>
					{#if current.feelsLikeC != null}
						<span class="muted">{tr('w.feels', { t: fmt.temp(current.feelsLikeC) })}</span>
					{/if}
				</span>
			</div>
			<dl class="facts">
				<dt>{tr('w.wind')}</dt>
				<dd class="data">
					{fmt.wind(current.windKmh)}
					{compass(lang, current.windDeg)}{#if current.gustKmh != null},
						{tr('w.gust', { v: fmt.wind(current.gustKmh) })}{/if}
				</dd>
				<dt>{tr('w.humidity')}</dt>
				<dd class="data">{unit(current.humidityPct, '%', 0)}</dd>
				<dt>{tr('w.pressure')}</dt>
				<dd class="data">{unit(current.pressureHpa, 'hPa', 0)}</dd>
				<dt>{tr('w.uv')}</dt>
				<dd class="data">{number(lang, current.uv)}</dd>
			</dl>
		</div>
	{/if}

	{#if weather.rain && show('rain')}
		<section class="part">
			<h3>{tr('w.rain60')}</h3>
			{#if weather.rain.expected60 === false}
				<p>{tr('w.rainNone')}</p>
			{:else if weather.rain.expected60}
				<p>{tr('w.rainSome', { v: number(lang, weather.rain.maxMmH) })}</p>
			{/if}
			{#if steps}
				<ol class="steps">
					{#each steps as mm, i (i)}
						<li>
							<span class="bar" style:--h="{Math.round((mm / stepMax) * 100)}%" aria-hidden="true"></span>
							<span class="data small">{number(lang, mm)} mm</span>
							<span class="muted small"
								>{tr('w.rainStep', { m: (weather.rain.stepMinutes ?? 15) * (i + 1) })}</span
							>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	{#if shortTermLines.length && show('rain')}
		<section class="part">
			<h3>{tr('w.st.title')}</h3>
			<ul class="st">
				{#each shortTermLines as line (line.text)}
					<li>
						{line.text}{#if line.at != null}, {tr('w.st.from')} <Time {lang} unix={line.at} />{/if}.
					</li>
				{/each}
			</ul>
			<p class="muted small">{tr('w.st.note')}</p>
		</section>
	{/if}

	{#if ensemble && show('ensemble')}
		<section class="part" aria-labelledby="ens-title">
			<h3 id="ens-title">{tr('w.ens.title')}</h3>
			<ol class="ens-bars" style:--n={ensemble.bars.length} aria-label={tr('w.ens.bars')}>
				{#each ensemble.bars as bar, i (i)}
					<li>
						<span class="visually-hidden">
							{tr('w.ens.bar', {
								h: hourLabel(lang, bar.endMinutes),
								p: bar.rain1Pct == null ? '–' : percent(lang, bar.rain1Pct)
							})}
						</span>
						<span class="ens-plot" aria-hidden="true">
							<span class="ens-bar" class:high={bar.high} style:--h="{bar.rain1Pct ?? 0}%">
								<span class="ens-value data">{bar.rain1Pct ?? '–'}</span>
							</span>
						</span>
						<span class="ens-hour data muted" aria-hidden="true">{hourLabel(lang, bar.endMinutes)}</span>
					</li>
				{/each}
			</ol>
			{#if ensemble.chips.length}
				<ul class="ens-chips">
					{#each ensemble.chips as chip (chip.kind)}
						<li class="ens-chip" class:strong={chip.strong}>
							{tr(CHIP_KEY[chip.kind], {
								p: percent(lang, chip.pct),
								v: fmt.wind(GUST_THRESHOLD_KMH),
								h: chip.atMinutes == null ? '' : hourLabel(lang, chip.atMinutes)
							})}
						</li>
					{/each}
				</ul>
			{/if}
			<p class="muted small">{tr('w.ens.legend')}</p>
			<p class="muted small">
				{tr('w.ens.credit', {
					run:
						ensemble.runUtc == null
							? '–'
							: String(new Date(ensemble.runUtc * 1000).getUTCHours()).padStart(2, '0') + ' h'
				})}
			</p>
		</section>
	{/if}

	{#if weather.daily.length && show('days')}
		<section class="part">
			<h3>{tr('w.days')}</h3>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">{tr('w.day')}</th>
							<th scope="col">{tr('w.sky')}</th>
							<th scope="col" class="num">{tr('w.min')}</th>
							<th scope="col" class="num">{tr('w.max')}</th>
							<th scope="col" class="num">{tr('w.rain')}</th>
							<th scope="col" class="num">{tr('w.rainProbability')}</th>
							<th scope="col" class="num">{tr('w.windMax')}</th>
						</tr>
					</thead>
					<tbody>
						{#each weather.daily as d (d.date)}
							<tr>
								<th scope="row">{day(d.date)}</th>
								<td>{skyLabel(lang, d.code)}</td>
								<td class="num data">{d.tminC == null ? '–' : `${fmt.deg(d.tminC, 1)} °`}</td>
								<td class="num data">{d.tmaxC == null ? '–' : `${fmt.deg(d.tmaxC, 1)} °`}</td>
								<td class="num data">{unit(d.rainMm, 'mm')}</td>
								<td class="num data">{unit(d.rainProbabilityPct, '%', 0)}</td>
								<td class="num data">{fmt.wind(d.windMaxKmh)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="muted small">{tr('w.daysNote')}</p>
		</section>
	{/if}

	<div class="grid">
		{#if weather.air && show('air')}
			<section class="part card">
				<h3>
					{tr('w.air')}{#if weather.air.stale}<span class="muted small"> · {tr('w.stale')}</span>{/if}
				</h3>
				<dl class="facts">
					<dt>{tr('w.eaqi')}</dt>
					<dd class="data">{number(lang, weather.air.eaqi, 0)}</dd>
					<dt>{tr('w.usAqi')}</dt>
					<dd class="data">{number(lang, weather.air.usAqi, 0)}</dd>
					<dt>{tr('w.pm25')}</dt>
					<dd class="data">{unit(weather.air.pm25, 'µg/m³')}</dd>
					<dt>{tr('w.pm10')}</dt>
					<dd class="data">{unit(weather.air.pm10, 'µg/m³')}</dd>
					<dt>{tr('w.dust')}</dt>
					<dd class="data">{unit(weather.air.dust, 'µg/m³')}</dd>
				</dl>
			</section>
		{/if}

		{#if weather.river && show('river')}
			<section class="part card">
				<h3>
					{tr('w.river')}{#if weather.river.stale}<span class="muted small"> · {tr('w.stale')}</span>{/if}
				</h3>
				<dl class="facts">
					<dt>{tr('w.riverToday')}</dt>
					<dd class="data">{unit(weather.river.todayM3s, 'm³/s')}</dd>
					<dt>{tr('w.riverMean')}</dt>
					<dd class="data">{unit(weather.river.meanM3s, 'm³/s')}</dd>
					<dt>{tr('w.riverMax')}</dt>
					<dd class="data">{unit(weather.river.maxM3s, 'm³/s')}</dd>
				</dl>
				<p class="muted small">{tr('w.riverNote')}</p>
			</section>
		{/if}

		{#if weather.fires && show('fires')}
			{@const fires = weather.fires}
			{@const km = number(lang, fires.radiusKm, 0)}
			<section class="part card">
				<h3>{tr('w.fires')}</h3>
				{#if fires.stale}
					<p class="muted small">{tr('w.firesStale')} <Time {lang} unix={fires.readAt} /></p>
				{/if}
				{#if fires.count === 0}
					<p class="small">{tr('w.firesNone', { km })}</p>
				{:else}
					<dl class="facts">
						<dt>{tr('w.firesCount', { km })}</dt>
						<dd class="data">{fires.count ?? '–'}</dd>
						<dt>{tr('w.firesNearest')}</dt>
						<dd class="data">{unit(fires.nearestKm, 'km', 0)}</dd>
						<dt>{tr('w.firesMaxFrp')}</dt>
						<dd class="data">{unit(fires.maxFrpMw, 'MW')}</dd>
						<dt>{tr('w.firesLatest')}</dt>
						<dd><Time {lang} unix={fires.latest} /></dd>
					</dl>
				{/if}
				<p class="muted small">{tr('fires.notAlert')}</p>
			</section>
		{/if}

		{#if weather.marine && show('marine')}
			<section class="part card">
				<h3>
					{tr('w.marine')}{#if weather.marine.stale}<span class="muted small"> · {tr('w.stale')}</span>{/if}
				</h3>
				<dl class="facts">
					<dt>{tr('w.wave')}</dt>
					<dd class="data">
						{fmt.length(weather.marine.waveM)}
						{compass(lang, weather.marine.waveDeg)}
						{unit(weather.marine.wavePeriodS, 's', 0)}
					</dd>
					<dt>{tr('w.swell')}</dt>
					<dd class="data">
						{fmt.length(weather.marine.swellM)}
						{compass(lang, weather.marine.swellDeg)}
						{unit(weather.marine.swellPeriodS, 's', 0)}
					</dd>
					<dt>{tr('w.current')}</dt>
					<dd class="data">
						{fmt.wind(weather.marine.currentKmh, 1)}
						{compass(lang, weather.marine.currentDeg)}
					</dd>
				</dl>
			</section>
		{/if}

		{#if weather.space && show('space')}
			<section class="part card">
				<h3>{tr('w.space')}</h3>
				<dl class="facts">
					<dt>{tr('w.kp')}</dt>
					<dd class="data">{number(lang, weather.space.kp)}</dd>
					<dt>{tr('w.storm')}</dt>
					<dd class="data">{weather.space.storm ?? '–'}</dd>
				</dl>
			</section>
		{/if}
	</div>

	{#if weather.drought && show('drought')}
		<DroughtPanel {lang} status={weather.drought} />
	{/if}

	{#if show('now') || show('days')}<p class="muted small">{tr('w.skyNote')}</p>{/if}
</div>

<style>
	.weather {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
	.now {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 28px;
		align-items: center;
	}
	.headline {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	.temp {
		font-size: 34px;
		line-height: 1;
	}
	.sky {
		display: flex;
		flex-direction: column;
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.part h3 {
		font-size: 16px;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		max-width: 420px;
	}
	.steps li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.bar {
		height: 44px;
		border-bottom: 2px solid var(--line);
		background: linear-gradient(to top, var(--accent) var(--h), transparent var(--h));
		border-radius: 3px 3px 0 0;
	}
	.ens-bars {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 4px;
		max-width: 520px;
	}
	.ens-bars li {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.ens-plot {
		position: relative;
		height: 96px;
		display: block;
	}
	.ens-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: var(--h);
		min-height: 2px;
		background: var(--surf-q2);
		border-radius: 3px 3px 0 0;
	}
	.ens-bar.high {
		background: var(--surf-q3);
	}
	.ens-value {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		text-align: center;
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
	}
	.ens-hour {
		text-align: center;
		font-size: 11px;
		white-space: nowrap;
	}
	.ens-chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.ens-chip {
		border: 1px solid var(--line);
		background: var(--accent-soft);
		border-radius: 14px;
		padding: 2px 10px;
		font-size: 13px;
	}
	/* From 50 %: a heavier outline and weight in the accent of the site, never a colour of the official warnings (the value is in the text). */
	.ens-chip.strong {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		font-weight: 600;
	}
	.st {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 14px;
		min-width: 100%;
	}
	th,
	td {
		padding: 6px 10px 6px 0;
		text-align: left;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	thead th {
		font-size: 12.5px;
		color: var(--muted);
		font-weight: 600;
	}
	.num {
		text-align: right;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: 12px;
	}
</style>
