<script lang="ts">
	// The weather of one grid point (`/v1/point`): now, the next hour, the next days, air, river, sea, space.
	// Every value comes from the API as it is; an unknown one shows "–", a block the API did not give is left out.
	import { number } from '$lib/format';
	import { translator, type Lang } from '$lib/i18n';
	import type { PointWeather } from '$lib/types';
	import { compass, skyLabel } from '$lib/weather';

	let { lang, weather }: { lang: Lang; weather: PointWeather & { stale?: boolean } } = $props();
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
	const credits = $derived([
		...new Set(
			[
				weather.attribution,
				weather.rain?.attribution,
				weather.air?.attribution,
				weather.river?.attribution,
				weather.marine?.attribution,
				weather.space?.attribution
			].flatMap((a) => (a ? a.split(' | ').map((part) => part.trim()) : []))
		)
	]);
</script>

<div class="weather">
	{#if weather.stale}
		<p class="note">{tr('near.weatherStale')}</p>
	{/if}

	{#if current}
		<div class="now card">
			<div class="headline">
				<span class="temp data">{unit(current.tempC, '°C')}</span>
				<span class="sky">
					<strong>{skyLabel(lang, current.code)}</strong>
					{#if current.feelsLikeC != null}
						<span class="muted">{tr('w.feels', { t: unit(current.feelsLikeC, '°C') })}</span>
					{/if}
				</span>
			</div>
			<dl class="facts">
				<dt>{tr('w.wind')}</dt>
				<dd class="data">
					{unit(current.windKmh, 'km/h', 0)}
					{compass(lang, current.windDeg)}{#if current.gustKmh != null},
						{tr('w.gust', { v: unit(current.gustKmh, 'km/h', 0) })}{/if}
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

	{#if weather.rain}
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

	{#if weather.daily.length}
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
								<td class="num data">{unit(d.tminC, '°')}</td>
								<td class="num data">{unit(d.tmaxC, '°')}</td>
								<td class="num data">{unit(d.rainMm, 'mm')}</td>
								<td class="num data">{unit(d.rainProbabilityPct, '%', 0)}</td>
								<td class="num data">{unit(d.windMaxKmh, 'km/h', 0)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<div class="grid">
		{#if weather.air}
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

		{#if weather.river}
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

		{#if weather.marine}
			<section class="part card">
				<h3>
					{tr('w.marine')}{#if weather.marine.stale}<span class="muted small"> · {tr('w.stale')}</span>{/if}
				</h3>
				<dl class="facts">
					<dt>{tr('w.wave')}</dt>
					<dd class="data">
						{unit(weather.marine.waveM, 'm')}
						{compass(lang, weather.marine.waveDeg)}
						{unit(weather.marine.wavePeriodS, 's', 0)}
					</dd>
					<dt>{tr('w.swell')}</dt>
					<dd class="data">
						{unit(weather.marine.swellM, 'm')}
						{compass(lang, weather.marine.swellDeg)}
						{unit(weather.marine.swellPeriodS, 's', 0)}
					</dd>
					<dt>{tr('w.current')}</dt>
					<dd class="data">
						{unit(weather.marine.currentKmh, 'km/h')}
						{compass(lang, weather.marine.currentDeg)}
					</dd>
				</dl>
			</section>
		{/if}

		{#if weather.space}
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

	<p class="muted small">{tr('w.skyNote')}</p>
	{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}
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
