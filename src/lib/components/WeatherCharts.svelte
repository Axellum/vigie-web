<script lang="ts">
	// Complementary weather charts for one grid point (`/v1/point`): meteogram (48-72 h), barometer / pressure trend,
	// UV & solar radiation, hourly air quality, and honest forecast-vs-measured comparison against a nearby station or buoy.
	// Built as pure responsive SVGs matching `SurfChart.svelte` (zero third-party chart libraries). Any tab or curve
	// without real API data is hidden; values are never fabricated or interpolated across gaps.
	import { number } from '#lib/format.js';
	import { translator, type Key, type Lang } from '#lib/i18n.js';
	import { placeFormat } from '#lib/placeFormat.js';
	import type { PointWeather } from '#lib/types.js';
	import { DEFAULT_UNITS, speed, speedLabel, temperature, temperatureLabel, type Units } from '#lib/units.js';
	import { compass } from '#lib/weather.js';
	import {
		airPollutantKeys,
		aqiBand,
		areaPath,
		availableTabs,
		compareMetrics,
		directionGapDeg,
		finiteCount,
		localDayKey,
		localDayLabel,
		mergePressureSeries,
		nightRuns,
		polylinePath,
		pressureTrend,
		uvBand,
		type MeasuredComparison,
		type WeatherChartTab
	} from '#lib/weatherCharts.js';

	let {
		lang,
		weather,
		units = DEFAULT_UNITS,
		measured = null,
		now = Math.floor(Date.now() / 1000)
	}: {
		lang: Lang;
		weather: PointWeather;
		units?: Units;
		measured?: MeasuredComparison | null;
		now?: number;
	} = $props();

	const tr = $derived(translator(lang));
	const fmt = $derived(placeFormat(lang, units));
	const utcOffsetS = $derived(weather.utcOffsetS ?? 0);
	const hourly = $derived(weather.hourly ?? []);
	const airHourly = $derived(weather.airHourly ?? []);
	const nowRef = $derived(weather.generated ?? now);

	const tabs = $derived(availableTabs(weather, measured, nowRef));
	let selectedTab = $state<WeatherChartTab | null>(null);
	const activeTab = $derived<WeatherChartTab | null>(
		selectedTab && tabs.includes(selectedTab) ? selectedTab : (tabs[0] ?? null)
	);

	let width = $state(640);
	const HOUR = 3600;
	const LEFT = 44;
	const RIGHT = 38;
	const TOP = 24;
	const inner = $derived(Math.max(180, width - LEFT - RIGHT));

	const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;
	const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

	const TAB_LABEL: Record<WeatherChartTab, Key> = {
		meteogram: 'wc.tab.meteogram',
		barometer: 'wc.tab.barometer',
		uv: 'wc.tab.uv',
		air: 'wc.tab.air',
		compare: 'wc.tab.compare'
	};

	function dayMarks(times: readonly number[], xFn: (t: number) => number) {
		const starts: number[] = [];
		let prev = '';
		for (const t of times) {
			const key = localDayKey(t, utcOffsetS);
			if (key !== prev) {
				starts.push(t);
				prev = key;
			}
		}
		return starts.map((t, i) => {
			const end = i + 1 < starts.length ? xFn(starts[i + 1]) : LEFT + inner;
			return { t, named: end - xFn(t) >= 50 };
		});
	}

	// ---- Meteogram geometry -------------------------------------------------------------------------------
	const mt0 = $derived(hourly[0]?.t ?? 0);
	const mt1 = $derived((hourly.at(-1)?.t ?? 0) + HOUR);
	const mx = (t: number) => LEFT + ((t - mt0) / Math.max(HOUR, mt1 - mt0)) * inner;
	const mxCenter = (t: number) => (mx(t) + mx(t + HOUR)) / 2;
	const mBarW = $derived(Math.max(1.5, inner / Math.max(1, hourly.length) - 1));
	const mNights = $derived(nightRuns(hourly));
	const mDays = $derived(
		dayMarks(
			hourly.map((h) => h.t),
			mx
		)
	);
	const mNowInside = $derived(hourly.length > 1 && nowRef >= mt0 && nowRef <= mt1);

	const hasTemp = $derived(finiteCount(hourly, (h) => h.tempC) >= 2);
	const hasFeels = $derived(finiteCount(hourly, (h) => h.feelsLikeC) >= 2);
	const hasDew = $derived(finiteCount(hourly, (h) => h.dewPointC) >= 2);
	const hasPrecip = $derived(finiteCount(hourly, (h) => h.precipMm) >= 2);
	const hasPrecipProb = $derived(finiteCount(hourly, (h) => h.precipProbPct) >= 2);
	const hasRainBand = $derived(hasPrecip || hasPrecipProb);
	const hasWind = $derived(finiteCount(hourly, (h) => h.windKmh) >= 2);
	const hasGust = $derived(finiteCount(hourly, (h) => h.windGustKmh) >= 2);
	const hasWindBand = $derived(hasWind || hasGust);
	const hasCloudLayers = $derived(
		finiteCount(hourly, (h) => h.cloudLowPct) >= 2 ||
			finiteCount(hourly, (h) => h.cloudMidPct) >= 2 ||
			finiteCount(hourly, (h) => h.cloudHighPct) >= 2
	);
	const hasCloudTotal = $derived(finiteCount(hourly, (h) => h.cloudCoverPct) >= 2);
	const hasCloudBand = $derived(hasCloudLayers || hasCloudTotal);

	const mLayout = $derived.by(() => {
		const GAP = 30;
		let y = TOP;
		const tempTop = hasTemp ? y : -1;
		const TEMP_H = 88;
		if (hasTemp) y += TEMP_H + GAP;
		const rainTop = hasRainBand ? y : -1;
		const RAIN_H = 62;
		if (hasRainBand) y += RAIN_H + GAP;
		const windTop = hasWindBand ? y : -1;
		const WIND_H = 60;
		if (hasWindBand) y += WIND_H + GAP;
		const cloudTop = hasCloudBand ? y : -1;
		const CLOUD_H = 44;
		if (hasCloudBand) y += CLOUD_H + 22;
		return { tempTop, TEMP_H, rainTop, RAIN_H, windTop, WIND_H, cloudTop, CLOUD_H, height: Math.max(120, y) };
	});

	const tempVals = $derived.by(() => {
		const vals: number[] = [];
		for (const h of hourly) {
			if (h.tempC != null) vals.push(temperature(h.tempC, units.temperature));
			if (h.feelsLikeC != null) vals.push(temperature(h.feelsLikeC, units.temperature));
			if (h.dewPointC != null) vals.push(temperature(h.dewPointC, units.temperature));
		}
		return vals;
	});
	const tempBounds = $derived.by(() => {
		if (!tempVals.length) return { min: 0, max: 20 };
		const lo = Math.min(...tempVals);
		const hi = Math.max(...tempVals);
		const step = hi - lo > 16 ? 5 : 2;
		const min = floorTo(lo - 0.5, step);
		const max = Math.max(min + step * 2, ceilTo(hi + 0.5, step));
		return { min, max };
	});
	const yTemp = (c: number) => {
		const v = temperature(c, units.temperature);
		return (
			mLayout.tempTop +
			mLayout.TEMP_H -
			((v - tempBounds.min) / Math.max(1, tempBounds.max - tempBounds.min)) * mLayout.TEMP_H
		);
	};
	const tempSummary = $derived.by(() => {
		const raw = hourly.map((h) => h.tempC).filter((v): v is number => v != null);
		return raw.length ? { min: Math.min(...raw), max: Math.max(...raw) } : null;
	});
	const totalPrecip = $derived.by(() => {
		const raw = hourly.map((h) => h.precipMm).filter((v): v is number => v != null);
		return raw.length ? raw.reduce((s, v) => s + v, 0) : null;
	});
	const maxGust = $derived.by(() => {
		const raw = hourly.map((h) => h.windGustKmh ?? h.windKmh).filter((v): v is number => v != null);
		return raw.length ? Math.max(...raw) : null;
	});

	const rainMax = $derived.by(() => {
		const vals = hourly.map((h) => h.precipMm).filter((v): v is number => v != null);
		const peak = vals.length ? Math.max(...vals) : 0;
		return peak <= 2 ? 2 : ceilTo(peak, peak > 10 ? 5 : 2);
	});
	const yRain = (mm: number) => mLayout.rainTop + mLayout.RAIN_H - (mm / rainMax) * mLayout.RAIN_H;
	const yProb = (p: number) => mLayout.rainTop + mLayout.RAIN_H - (p / 100) * mLayout.RAIN_H;

	const windMax = $derived.by(() => {
		const vals = hourly
			.flatMap((h) => [h.windKmh, h.windGustKmh])
			.filter((v): v is number => v != null)
			.map((v) => speed(v, units.wind));
		const peak = vals.length ? Math.max(...vals) : 20;
		return ceilTo(Math.max(20, peak), 10);
	});
	const yWind = (kmh: number) =>
		mLayout.windTop + mLayout.WIND_H - (speed(kmh, units.wind) / windMax) * mLayout.WIND_H;
	const yCloud = (pctVal: number) => mLayout.cloudTop + mLayout.CLOUD_H - (pctVal / 100) * mLayout.CLOUD_H;

	// ---- Barometer geometry -------------------------------------------------------------------------------
	const pressureSeries = $derived(mergePressureSeries(weather.pressureHistory, weather.hourly, nowRef));
	const pTrend = $derived(pressureTrend(pressureSeries, nowRef));
	const pt0 = $derived(pressureSeries[0]?.t ?? 0);
	const pt1 = $derived(pressureSeries.at(-1)?.t ?? pt0 + HOUR);
	const px = (t: number) => LEFT + ((t - pt0) / Math.max(HOUR, pt1 - pt0)) * inner;
	const pDays = $derived(
		dayMarks(
			pressureSeries.map((p) => p.t),
			px
		)
	);
	const pNowInside = $derived(pressureSeries.length > 1 && nowRef >= pt0 && nowRef <= pt1);
	const BARO_H = 140;
	const BARO_TOTAL = TOP + BARO_H + 22;
	const pBounds = $derived.by(() => {
		if (!pressureSeries.length) return { min: 1000, max: 1025 };
		const vals = pressureSeries.map((p) => p.pressureHpa);
		const lo = Math.min(...vals);
		const hi = Math.max(...vals);
		const pad = Math.max(2, (hi - lo) * 0.15);
		const min = floorTo(lo - pad, 5);
		const max = Math.max(min + 10, ceilTo(hi + pad, 5));
		return { min, max };
	});
	const yBaro = (hpa: number) =>
		TOP + BARO_H - ((hpa - pBounds.min) / Math.max(1, pBounds.max - pBounds.min)) * BARO_H;
	const pastPressure = $derived(pressureSeries.filter((p) => p.past));
	const futurePressure = $derived.by(() => {
		const future = pressureSeries.filter((p) => !p.past);
		const bridge = pastPressure.at(-1);
		return bridge && future.length ? [bridge, ...future] : future;
	});
	const ref1013Inside = $derived(1013 >= pBounds.min && 1013 <= pBounds.max);

	// ---- UV & Solar geometry ------------------------------------------------------------------------------
	const hasUv = $derived(finiteCount(hourly, (h) => h.uvIndex) >= 2);
	const hasSolar = $derived(finiteCount(hourly, (h) => h.shortwaveWm2) >= 2);
	const UV_H = 140;
	const UV_TOTAL = TOP + UV_H + 22;
	const uvPeak = $derived.by(() => {
		const vals = hourly.map((h) => h.uvIndex).filter((v): v is number => v != null);
		return vals.length ? Math.max(...vals) : null;
	});
	const solarPeak = $derived.by(() => {
		const vals = hourly.map((h) => h.shortwaveWm2).filter((v): v is number => v != null);
		return vals.length ? Math.max(...vals) : null;
	});
	const uvMax = $derived(ceilTo(Math.max(8, uvPeak ?? 8), 2));
	const solarMax = $derived(ceilTo(Math.max(200, solarPeak ?? 200), 200));
	const yUv = (uv: number) => TOP + UV_H - (uv / uvMax) * UV_H;
	const ySolar = (wm2: number) => TOP + UV_H - (wm2 / solarMax) * UV_H;
	const uvSegments = $derived.by(() => {
		const segs: { x1: number; y1: number; x2: number; y2: number; band: string }[] = [];
		for (let i = 1; i < hourly.length; i++) {
			const a = hourly[i - 1];
			const b = hourly[i];
			if (a.uvIndex == null || b.uvIndex == null) continue;
			segs.push({
				x1: mxCenter(a.t),
				y1: yUv(a.uvIndex),
				x2: mxCenter(b.t),
				y2: yUv(b.uvIndex),
				band: uvBand(Math.max(a.uvIndex, b.uvIndex))
			});
		}
		return segs;
	});

	// ---- Air Quality geometry -----------------------------------------------------------------------------
	const at0 = $derived(airHourly[0]?.t ?? 0);
	const at1 = $derived((airHourly.at(-1)?.t ?? 0) + HOUR);
	const ax = (t: number) => LEFT + ((t - at0) / Math.max(HOUR, at1 - at0)) * inner;
	const axCenter = (t: number) => (ax(t) + ax(t + HOUR)) / 2;
	const aDays = $derived(
		dayMarks(
			airHourly.map((a) => a.t),
			ax
		)
	);
	const aNowInside = $derived(airHourly.length > 1 && nowRef >= at0 && nowRef <= at1);
	const hasEaqi = $derived(finiteCount(airHourly, (a) => a.europeanAqi) >= 2);
	const pollutants = $derived(airPollutantKeys(airHourly));
	const aLayout = $derived.by(() => {
		const GAP = 24;
		let y = TOP;
		const eaqiTop = hasEaqi ? y : -1;
		const EAQI_H = 66;
		if (hasEaqi) y += EAQI_H + GAP;
		const polTop = pollutants.length ? y : -1;
		const POL_H = 104;
		if (pollutants.length) y += POL_H + 20;
		return { eaqiTop, EAQI_H, polTop, POL_H, height: Math.max(120, y) };
	});
	const eaqiPeak = $derived.by(() => {
		const vals = airHourly.map((a) => a.europeanAqi).filter((v): v is number => v != null);
		return vals.length ? Math.max(...vals) : null;
	});
	const eaqiMax = $derived(ceilTo(Math.max(60, eaqiPeak ?? 60), 20));
	const yEaqi = (v: number) => aLayout.eaqiTop + aLayout.EAQI_H - (v / eaqiMax) * aLayout.EAQI_H;
	const polMax = $derived.by(() => {
		const vals: number[] = [];
		for (const a of airHourly) {
			for (const k of pollutants) {
				const v = a[k];
				if (v != null) vals.push(v);
			}
		}
		const peak = vals.length ? Math.max(...vals) : 40;
		return ceilTo(Math.max(20, peak), peak > 100 ? 50 : 20);
	});
	const yPol = (v: number) => aLayout.polTop + aLayout.POL_H - (v / polMax) * aLayout.POL_H;

	const POL_META: Record<'pm25' | 'pm10' | 'ozone' | 'nitrogenDioxide' | 'dust', { key: Key; cls: string }> =
		{
			pm25: { key: 'wc.air.pm25', cls: 'pol-pm25' },
			pm10: { key: 'wc.air.pm10', cls: 'pol-pm10' },
			ozone: { key: 'wc.air.ozone', cls: 'pol-o3' },
			nitrogenDioxide: { key: 'wc.air.no2', cls: 'pol-no2' },
			dust: { key: 'wc.air.dust', cls: 'pol-dust' }
		};

	// ---- Forecast vs Measured -----------------------------------------------------------------------------
	const compRows = $derived(compareMetrics(weather, measured, nowRef));
	const dirGap = $derived(directionGapDeg(weather.current?.windDeg ?? null, measured?.windFromDeg ?? null));
	const formatMetric = (kind: 'wind' | 'gust' | 'temp' | 'pressure', val: number) => {
		if (kind === 'wind' || kind === 'gust') return fmt.wind(val, 0);
		if (kind === 'temp') return fmt.temp(val, 1);
		return `${number(lang, val, 1)} hPa`;
	};
	const formatDiff = (kind: 'wind' | 'gust' | 'temp' | 'pressure', diff: number) => {
		const converted =
			kind === 'wind' || kind === 'gust'
				? speed(diff, units.wind)
				: kind === 'temp'
					? units.temperature === 'f'
						? (diff * 9) / 5
						: diff
					: diff;
		const digits = kind === 'wind' || kind === 'gust' ? 0 : 1;
		const rounded = digits === 0 ? Math.round(converted) : Math.round(converted * 10) / 10;
		const sign = rounded > 0 ? '+' : '';
		const u =
			kind === 'wind' || kind === 'gust'
				? speedLabel(lang, units.wind)
				: kind === 'temp'
					? temperatureLabel(units.temperature)
					: 'hPa';
		return `${sign}${number(lang, rounded, digits)} ${u}`;
	};
</script>

{#if tabs.length > 0 && activeTab}
	<section class="card wc" aria-label={tr('wc.title')} data-testid="weather-charts">
		<div class="wc-head">
			<h3>{tr('wc.title')}</h3>
			<div class="tabs" role="tablist" aria-label={tr('wc.tabsLabel')}>
				{#each tabs as tab (tab)}
					<button
						type="button"
						role="tab"
						class="chip"
						aria-selected={activeTab === tab}
						data-testid="wc-tab-{tab}"
						onclick={() => (selectedTab = tab)}
					>
						{tr(TAB_LABEL[tab])}
					</button>
				{/each}
			</div>
		</div>

		<div class="chart-wrap" role="tabpanel" bind:clientWidth={width}>
			{#if activeTab === 'meteogram'}
				<div class="summary small" data-testid="chart-meteogram">
					{#if tempSummary}
						<span>
							{tr('wc.tempRange')}:
							<strong class="data">{fmt.deg(tempSummary.min, 0)}° / {fmt.temp(tempSummary.max, 0)}</strong>
						</span>
					{/if}
					{#if totalPrecip != null}
						<span>
							{tr('wc.precipTotal')}: <strong class="data">{number(lang, totalPrecip, 1)} mm</strong>
						</span>
					{/if}
					{#if maxGust != null}
						<span>
							{tr('wc.maxWind')}: <strong class="data">{fmt.wind(maxGust, 0)}</strong>
						</span>
					{/if}
				</div>
				<svg
					width={inner + LEFT + RIGHT}
					height={mLayout.height}
					viewBox="0 0 {inner + LEFT + RIGHT} {mLayout.height}"
					role="img"
					aria-label={tr('wc.aria.meteogram')}
				>
					{#each mNights as n (n.from)}
						<rect
							x={mx(n.from)}
							y={TOP - 4}
							width={Math.max(0, mx(n.to) - mx(n.from))}
							height={mLayout.height - TOP}
							class="night"
						/>
					{/each}
					{#each mDays as d (d.t)}
						<line x1={mx(d.t)} x2={mx(d.t)} y1={TOP - 4} y2={mLayout.height - 4} class="day" />
						{#if d.named}
							<text x={mx(d.t) + 3} y="12" class="label">{localDayLabel(lang, d.t, utcOffsetS)}</text>
						{/if}
					{/each}

					{#if hasTemp}
						{@const midTemp = (tempBounds.min + tempBounds.max) / 2}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={mLayout.tempTop + mLayout.TEMP_H}
							y2={mLayout.tempTop + mLayout.TEMP_H}
							class="axis"
						/>
						{#each [tempBounds.min, midTemp, tempBounds.max] as v (v)}
							{@const yPos =
								mLayout.tempTop +
								mLayout.TEMP_H -
								((v - tempBounds.min) / Math.max(1, tempBounds.max - tempBounds.min)) * mLayout.TEMP_H}
							<line x1={LEFT} x2={LEFT + inner} y1={yPos} y2={yPos} class="grid" />
							<text x={LEFT - 4} y={yPos + 4} class="label" text-anchor="end">{number(lang, v, 0)}°</text>
						{/each}
						{#if tempBounds.min < 0 && tempBounds.max > 0 && units.temperature === 'c'}
							<line x1={LEFT} x2={LEFT + inner} y1={yTemp(0)} y2={yTemp(0)} class="zero" />
						{/if}
						{#if hasDew}
							<path
								d={polylinePath(
									hourly,
									(h) => h.t,
									(h) => h.dewPointC,
									mxCenter,
									yTemp
								)}
								class="dew"
							/>
						{/if}
						{#if hasFeels}
							<path
								d={polylinePath(
									hourly,
									(h) => h.t,
									(h) => h.feelsLikeC,
									mxCenter,
									yTemp
								)}
								class="feels"
							/>
						{/if}
						<path
							d={polylinePath(
								hourly,
								(h) => h.t,
								(h) => h.tempC,
								mxCenter,
								yTemp
							)}
							class="temp-line"
						/>
						<text x={LEFT} y={mLayout.tempTop + mLayout.TEMP_H + 14} class="label title">
							{tr('wc.band.temp', { u: temperatureLabel(units.temperature) })}
						</text>
					{/if}

					{#if hasRainBand}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={mLayout.rainTop + mLayout.RAIN_H}
							y2={mLayout.rainTop + mLayout.RAIN_H}
							class="axis"
						/>
						{#each [rainMax / 2, rainMax] as v (v)}
							<line x1={LEFT} x2={LEFT + inner} y1={yRain(v)} y2={yRain(v)} class="grid" />
							<text x={LEFT - 4} y={yRain(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
						{/each}
						{#if hasPrecipProb}
							{#each [50, 100] as p (p)}
								<text x={LEFT + inner + 4} y={yProb(p) + 4} class="label">{p}%</text>
							{/each}
						{/if}
						{#if hasPrecip}
							{#each hourly as h (h.t)}
								{#if h.precipMm != null && h.precipMm > 0}
									<rect
										x={mx(h.t)}
										y={yRain(h.precipMm)}
										width={mBarW}
										height={Math.max(1.5, mLayout.rainTop + mLayout.RAIN_H - yRain(h.precipMm))}
										class="rain-bar"
									/>
								{/if}
							{/each}
						{/if}
						{#if hasPrecipProb}
							<path
								d={polylinePath(
									hourly,
									(h) => h.t,
									(h) => h.precipProbPct,
									mxCenter,
									yProb
								)}
								class="prob-line"
							/>
						{/if}
						<text x={LEFT} y={mLayout.rainTop + mLayout.RAIN_H + 14} class="label title">
							{tr('wc.band.precip')}
						</text>
						{#if hasPrecipProb}
							<text
								x={LEFT + inner}
								y={mLayout.rainTop + mLayout.RAIN_H + 14}
								class="label"
								text-anchor="end"
							>
								{tr('wc.band.precipProb')}
							</text>
						{/if}
					{/if}

					{#if hasWindBand}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={mLayout.windTop + mLayout.WIND_H}
							y2={mLayout.windTop + mLayout.WIND_H}
							class="axis"
						/>
						{#each [windMax / 2, windMax] as v (v)}
							{@const yPos = mLayout.windTop + mLayout.WIND_H - (v / windMax) * mLayout.WIND_H}
							<line x1={LEFT} x2={LEFT + inner} y1={yPos} y2={yPos} class="grid" />
							<text x={LEFT - 4} y={yPos + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
						{/each}
						{#if hasGust}
							<path
								d={polylinePath(
									hourly,
									(h) => h.t,
									(h) => h.windGustKmh,
									mxCenter,
									yWind
								)}
								class="gust-line"
							/>
						{/if}
						{#if hasWind}
							<path
								d={polylinePath(
									hourly,
									(h) => h.t,
									(h) => h.windKmh,
									mxCenter,
									yWind
								)}
								class="wind-line"
							/>
						{/if}
						<text x={LEFT} y={mLayout.windTop + mLayout.WIND_H + 14} class="label title">
							{tr('wc.band.wind', { u: speedLabel(lang, units.wind) })}
						</text>
					{/if}

					{#if hasCloudBand}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={mLayout.cloudTop + mLayout.CLOUD_H}
							y2={mLayout.cloudTop + mLayout.CLOUD_H}
							class="axis"
						/>
						<line x1={LEFT} x2={LEFT + inner} y1={yCloud(50)} y2={yCloud(50)} class="grid" />
						<text x={LEFT - 4} y={yCloud(100) + 4} class="label" text-anchor="end">100%</text>
						<text x={LEFT - 4} y={yCloud(50) + 4} class="label" text-anchor="end">50%</text>
						{#if hasCloudLayers}
							<path
								d={areaPath(
									hourly,
									(h) => h.t,
									(h) => h.cloudHighPct,
									mxCenter,
									yCloud,
									mLayout.cloudTop + mLayout.CLOUD_H
								)}
								class="cloud-high"
							/>
							<path
								d={areaPath(
									hourly,
									(h) => h.t,
									(h) => h.cloudMidPct,
									mxCenter,
									yCloud,
									mLayout.cloudTop + mLayout.CLOUD_H
								)}
								class="cloud-mid"
							/>
							<path
								d={areaPath(
									hourly,
									(h) => h.t,
									(h) => h.cloudLowPct,
									mxCenter,
									yCloud,
									mLayout.cloudTop + mLayout.CLOUD_H
								)}
								class="cloud-low"
							/>
						{:else}
							<path
								d={areaPath(
									hourly,
									(h) => h.t,
									(h) => h.cloudCoverPct,
									mxCenter,
									yCloud,
									mLayout.cloudTop + mLayout.CLOUD_H
								)}
								class="cloud-mid"
							/>
						{/if}
						<text x={LEFT} y={mLayout.cloudTop + mLayout.CLOUD_H + 14} class="label title">
							{tr('wc.band.clouds')}
						</text>
					{/if}

					{#if mNowInside}
						<line x1={mx(nowRef)} x2={mx(nowRef)} y1={TOP - 4} y2={mLayout.height - 4} class="now" />
					{/if}
				</svg>
				<div class="legend small muted">
					{#if hasTemp}<span><i class="sw sw-accent"></i>{tr('wc.leg.temp')}</span>{/if}
					{#if hasFeels}<span><i class="sw sw-dash"></i>{tr('wc.leg.feels')}</span>{/if}
					{#if hasDew}<span><i class="sw sw-dew"></i>{tr('wc.leg.dew')}</span>{/if}
					{#if hasPrecip}<span><i class="sw sw-rain"></i>{tr('wc.leg.precip')}</span>{/if}
					{#if hasGust}<span><i class="sw sw-dash"></i>{tr('wc.leg.gusts')}</span>{/if}
					{#if hasCloudLayers}
						<span><i class="sw sw-cl-low"></i>{tr('wc.leg.cloudLow')}</span>
						<span><i class="sw sw-cl-mid"></i>{tr('wc.leg.cloudMid')}</span>
						<span><i class="sw sw-cl-high"></i>{tr('wc.leg.cloudHigh')}</span>
					{/if}
				</div>
			{:else if activeTab === 'barometer'}
				<div class="summary small" data-testid="chart-barometer">
					{#if weather.current?.pressureHpa != null}
						<span>
							{tr('w.pressure')}:
							<strong class="data">{number(lang, weather.current.pressureHpa, 1)} hPa</strong>
						</span>
					{/if}
					{#if pTrend}
						<span class="trend trend-{pTrend.kind}" data-testid="pressure-trend">
							{tr(`wc.baro.${pTrend.kind}` as Key)}
							(<span class="data"
								>{pTrend.deltaHpa > 0 ? '+' : ''}{number(lang, pTrend.deltaHpa, 1)} hPa / {pTrend.hours} h</span
							>)
						</span>
					{/if}
				</div>
				<svg
					width={inner + LEFT + RIGHT}
					height={BARO_TOTAL}
					viewBox="0 0 {inner + LEFT + RIGHT} {BARO_TOTAL}"
					role="img"
					aria-label={tr('wc.aria.barometer')}
				>
					{#each pDays as d (d.t)}
						<line x1={px(d.t)} x2={px(d.t)} y1={TOP - 4} y2={TOP + BARO_H} class="day" />
						{#if d.named}
							<text x={px(d.t) + 3} y="12" class="label">{localDayLabel(lang, d.t, utcOffsetS)}</text>
						{/if}
					{/each}
					<line x1={LEFT} x2={LEFT + inner} y1={TOP + BARO_H} y2={TOP + BARO_H} class="axis" />
					{#each [pBounds.min, (pBounds.min + pBounds.max) / 2, pBounds.max] as v (v)}
						<line x1={LEFT} x2={LEFT + inner} y1={yBaro(v)} y2={yBaro(v)} class="grid" />
						<text x={LEFT - 4} y={yBaro(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
					{/each}
					{#if ref1013Inside}
						<line x1={LEFT} x2={LEFT + inner} y1={yBaro(1013)} y2={yBaro(1013)} class="zero" />
						<text x={LEFT + inner + 4} y={yBaro(1013) + 4} class="label">1013</text>
					{/if}
					<path
						d={areaPath(
							pressureSeries,
							(p) => p.t,
							(p) => p.pressureHpa,
							px,
							yBaro,
							TOP + BARO_H
						)}
						class="baro-area"
					/>
					{#if pastPressure.length >= 2}
						<path
							d={polylinePath(
								pastPressure,
								(p) => p.t,
								(p) => p.pressureHpa,
								px,
								yBaro
							)}
							class="baro-past"
						/>
					{/if}
					{#if futurePressure.length >= 2}
						<path
							d={polylinePath(
								futurePressure,
								(p) => p.t,
								(p) => p.pressureHpa,
								px,
								yBaro
							)}
							class="baro-future"
						/>
					{/if}
					{#if pNowInside}
						<line x1={px(nowRef)} x2={px(nowRef)} y1={TOP - 4} y2={TOP + BARO_H} class="now" />
						<text
							x={px(nowRef) + (px(nowRef) > LEFT + inner * 0.78 ? -4 : 4)}
							y={TOP + 10}
							class="label title"
							text-anchor={px(nowRef) > LEFT + inner * 0.78 ? 'end' : 'start'}
						>
							{tr('w.now')}
						</text>
					{/if}
					<text x={LEFT} y={TOP + BARO_H + 15} class="label title">{tr('wc.band.pressure')}</text>
				</svg>
				<div class="legend small muted">
					{#if pastPressure.length >= 2}
						<span><i class="sw sw-ink"></i>{tr('wc.baro.past')}</span>
					{/if}
					<span><i class="sw sw-accent"></i>{tr('wc.baro.forecast')}</span>
					<span><i class="sw sw-dash"></i>1013 hPa</span>
				</div>
			{:else if activeTab === 'uv'}
				<div class="summary small" data-testid="chart-uv">
					{#if uvPeak != null}
						<span>
							{tr('wc.uv.peak')}:
							<strong class="data">{number(lang, uvPeak, 1)}</strong>
							<span class="uv-pill uv-{uvBand(uvPeak)}">{tr(`wc.uv.band.${uvBand(uvPeak)}` as Key)}</span>
						</span>
					{/if}
					{#if solarPeak != null}
						<span>
							{tr('wc.solar.peak')}: <strong class="data">{number(lang, solarPeak, 0)} W/m²</strong>
						</span>
					{/if}
				</div>
				<svg
					width={inner + LEFT + RIGHT}
					height={UV_TOTAL}
					viewBox="0 0 {inner + LEFT + RIGHT} {UV_TOTAL}"
					role="img"
					aria-label={tr('wc.aria.uv')}
				>
					{#each mNights as n (n.from)}
						<rect
							x={mx(n.from)}
							y={TOP - 4}
							width={Math.max(0, mx(n.to) - mx(n.from))}
							height={UV_H + 4}
							class="night"
						/>
					{/each}
					{#each mDays as d (d.t)}
						<line x1={mx(d.t)} x2={mx(d.t)} y1={TOP - 4} y2={TOP + UV_H} class="day" />
						{#if d.named}
							<text x={mx(d.t) + 3} y="12" class="label">{localDayLabel(lang, d.t, utcOffsetS)}</text>
						{/if}
					{/each}
					<line x1={LEFT} x2={LEFT + inner} y1={TOP + UV_H} y2={TOP + UV_H} class="axis" />
					{#if hasUv}
						{#each [uvMax / 2, uvMax] as v (v)}
							<line x1={LEFT} x2={LEFT + inner} y1={yUv(v)} y2={yUv(v)} class="grid" />
							<text x={LEFT - 4} y={yUv(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
						{/each}
					{/if}
					{#if hasSolar}
						{#each [solarMax / 2, solarMax] as v (v)}
							<text x={LEFT + inner + 4} y={ySolar(v) + 4} class="label">{number(lang, v, 0)}</text>
						{/each}
						<path
							d={areaPath(
								hourly,
								(h) => h.t,
								(h) => h.shortwaveWm2,
								mxCenter,
								ySolar,
								TOP + UV_H
							)}
							class="solar-area"
						/>
						<path
							d={polylinePath(
								hourly,
								(h) => h.t,
								(h) => h.shortwaveWm2,
								mxCenter,
								ySolar
							)}
							class="solar-line"
						/>
					{/if}
					{#if hasUv}
						{#each uvSegments as s, idx (idx)}
							<line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="uv-seg uv-stroke-{s.band}" />
						{/each}
						{#each hourly as h (h.t)}
							{#if h.uvIndex != null && h.uvIndex > 0}
								<circle
									cx={mxCenter(h.t)}
									cy={yUv(h.uvIndex)}
									r="2"
									class="uv-dot uv-fill-{uvBand(h.uvIndex)}"
								/>
							{/if}
						{/each}
					{/if}
					{#if mNowInside}
						<line x1={mx(nowRef)} x2={mx(nowRef)} y1={TOP - 4} y2={TOP + UV_H} class="now" />
					{/if}
					<text x={LEFT} y={TOP + UV_H + 15} class="label title">{tr('wc.band.uv')}</text>
					{#if hasSolar}
						<text x={LEFT + inner} y={TOP + UV_H + 15} class="label" text-anchor="end">W/m²</text>
					{/if}
				</svg>
				<div class="legend small muted">
					{#each ['low', 'moderate', 'high', 'very_high', 'extreme'] as b (b)}
						<span><i class="sw uv-bg-{b}"></i>{tr(`wc.uv.band.${b}` as Key)}</span>
					{/each}
					{#if hasSolar}<span><i class="sw sw-solar"></i>{tr('wc.leg.solar')}</span>{/if}
				</div>
			{:else if activeTab === 'air'}
				<div class="summary small" data-testid="chart-air">
					{#if eaqiPeak != null}
						<span>
							{tr('wc.air.peakEaqi')}:
							<strong class="data">{number(lang, eaqiPeak, 0)}</strong>
							({tr(`wc.air.band.${aqiBand(eaqiPeak)}` as Key)})
						</span>
					{/if}
				</div>
				<svg
					width={inner + LEFT + RIGHT}
					height={aLayout.height}
					viewBox="0 0 {inner + LEFT + RIGHT} {aLayout.height}"
					role="img"
					aria-label={tr('wc.aria.air')}
				>
					{#each aDays as d (d.t)}
						<line x1={ax(d.t)} x2={ax(d.t)} y1={TOP - 4} y2={aLayout.height - 4} class="day" />
						{#if d.named}
							<text x={ax(d.t) + 3} y="12" class="label">{localDayLabel(lang, d.t, utcOffsetS)}</text>
						{/if}
					{/each}

					{#if hasEaqi}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={aLayout.eaqiTop + aLayout.EAQI_H}
							y2={aLayout.eaqiTop + aLayout.EAQI_H}
							class="axis"
						/>
						{#each [eaqiMax / 2, eaqiMax] as v (v)}
							<line x1={LEFT} x2={LEFT + inner} y1={yEaqi(v)} y2={yEaqi(v)} class="grid" />
							<text x={LEFT - 4} y={yEaqi(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
						{/each}
						<path
							d={polylinePath(
								airHourly,
								(a) => a.t,
								(a) => a.europeanAqi,
								axCenter,
								yEaqi
							)}
							class="eaqi-line"
						/>
						<text x={LEFT} y={aLayout.eaqiTop + aLayout.EAQI_H + 14} class="label title">
							{tr('wc.band.eaqi')}
						</text>
					{/if}

					{#if pollutants.length}
						<line
							x1={LEFT}
							x2={LEFT + inner}
							y1={aLayout.polTop + aLayout.POL_H}
							y2={aLayout.polTop + aLayout.POL_H}
							class="axis"
						/>
						{#each [polMax / 2, polMax] as v (v)}
							<line x1={LEFT} x2={LEFT + inner} y1={yPol(v)} y2={yPol(v)} class="grid" />
							<text x={LEFT - 4} y={yPol(v) + 4} class="label" text-anchor="end">{number(lang, v, 0)}</text>
						{/each}
						{#each pollutants as k (k)}
							<path
								d={polylinePath(
									airHourly,
									(a) => a.t,
									(a) => a[k],
									axCenter,
									yPol
								)}
								class="pol-line {POL_META[k].cls}"
							/>
						{/each}
						<text x={LEFT} y={aLayout.polTop + aLayout.POL_H + 14} class="label title">
							{tr('wc.band.pollutants')}
						</text>
					{/if}

					{#if aNowInside}
						<line x1={ax(nowRef)} x2={ax(nowRef)} y1={TOP - 4} y2={aLayout.height - 4} class="now" />
					{/if}
				</svg>
				<div class="legend small muted">
					{#if hasEaqi}<span><i class="sw sw-accent"></i>EAQI</span>{/if}
					{#each pollutants as k (k)}
						<span><i class="sw {POL_META[k].cls}-bg"></i>{tr(POL_META[k].key)}</span>
					{/each}
				</div>
			{:else if activeTab === 'compare' && measured}
				<div class="compare" data-testid="chart-compare">
					<p class="small">
						<strong>{measured.sourceName}</strong>
						· {tr(measured.kind === 'buoy' ? 'wc.comp.buoy' : 'wc.comp.station', {
							km: number(lang, measured.distanceKm, 1)
						})}
						{#if measured.altM != null}
							· {number(lang, measured.altM, 0)} m
						{/if}
						· {tr('wc.comp.measuredAt', { time: fmt.hour(measured.measuredUtc) })}
					</p>
					<ul class="comp-list">
						{#each compRows as row (row.kind)}
							{@const scale = Math.max(1, Math.abs(row.forecast), Math.abs(row.measured))}
							<li>
								<div class="comp-head small">
									<strong>{tr(`wc.comp.${row.kind}` as Key)}</strong>
									<span class="data muted">{tr('wc.comp.diff')}: {formatDiff(row.kind, row.diff)}</span>
								</div>
								<div class="comp-bars">
									<div class="comp-row">
										<span class="comp-lbl muted small">{tr('wc.comp.forecast')}</span>
										<span class="comp-track" aria-hidden="true">
											<span
												class="comp-fill fc"
												style:width="{Math.max(4, Math.round((Math.abs(row.forecast) / scale) * 100))}%"
											></span>
										</span>
										<span class="comp-val data small">{formatMetric(row.kind, row.forecast)}</span>
									</div>
									<div class="comp-row">
										<span class="comp-lbl muted small">{tr('wc.comp.measured')}</span>
										<span class="comp-track" aria-hidden="true">
											<span
												class="comp-fill obs"
												style:width="{Math.max(4, Math.round((Math.abs(row.measured) / scale) * 100))}%"
											></span>
										</span>
										<span class="comp-val data small">{formatMetric(row.kind, row.measured)}</span>
									</div>
								</div>
							</li>
						{/each}
					</ul>
					{#if measured.windFromDeg != null && weather.current?.windDeg != null}
						<p class="small muted">
							{tr('wc.comp.dir', {
								fc: compass(lang, weather.current.windDeg),
								obs: compass(lang, measured.windFromDeg),
								gap: dirGap != null ? number(lang, dirGap, 0) : '–'
							})}
						</p>
					{/if}
					<p class="muted small">{tr('wc.comp.note')}</p>
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.wc {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.wc-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.wc-head h3 {
		font-size: 16px;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tabs .chip[aria-selected='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.chart-wrap {
		width: 100%;
		min-width: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		align-items: center;
	}
	svg {
		display: block;
		max-width: 100%;
	}
	.night {
		fill: color-mix(in srgb, var(--muted) 14%, transparent);
	}
	.day {
		stroke: var(--line);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	.zero {
		stroke: var(--muted);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		opacity: 0.7;
	}
	.now {
		stroke: var(--ink);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.label {
		font-family: var(--font-data);
		font-size: 11px;
		fill: var(--muted);
	}
	.title {
		fill: var(--ink);
	}
	.temp-line,
	.wind-line,
	.baro-future,
	.eaqi-line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
	}
	.feels,
	.gust-line {
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.2;
		stroke-dasharray: 3 3;
	}
	.dew {
		fill: none;
		stroke: var(--wind-2);
		stroke-width: 1.3;
		stroke-dasharray: 2 2;
	}
	.rain-bar {
		fill: var(--surf-q2);
	}
	.prob-line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.2;
		stroke-dasharray: 3 2;
		opacity: 0.85;
	}
	.cloud-high {
		fill: color-mix(in srgb, var(--muted) 22%, transparent);
	}
	.cloud-mid {
		fill: color-mix(in srgb, var(--muted) 40%, transparent);
	}
	.cloud-low {
		fill: color-mix(in srgb, var(--muted) 64%, transparent);
	}
	.baro-area {
		fill: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.baro-past {
		fill: none;
		stroke: var(--ink);
		stroke-width: 2;
	}
	.trend {
		font-weight: 600;
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg);
	}
	.trend-rising {
		border-color: var(--calm-ink);
		color: var(--calm-ink);
	}
	.trend-falling {
		border-color: var(--accent);
		color: var(--accent);
	}
	.solar-area {
		fill: color-mix(in srgb, var(--sev-yellow) 22%, transparent);
	}
	.solar-line {
		fill: none;
		stroke: color-mix(in srgb, var(--sev-yellow) 75%, var(--ink));
		stroke-width: 1.1;
	}
	.uv-seg {
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.uv-stroke-low {
		stroke: var(--sev-green);
	}
	.uv-stroke-moderate {
		stroke: var(--sev-yellow);
	}
	.uv-stroke-high {
		stroke: var(--sev-orange);
	}
	.uv-stroke-very_high {
		stroke: var(--sev-red);
	}
	.uv-stroke-extreme {
		stroke: var(--wind-5);
	}
	.uv-fill-low {
		fill: var(--sev-green);
	}
	.uv-fill-moderate {
		fill: var(--sev-yellow);
	}
	.uv-fill-high {
		fill: var(--sev-orange);
	}
	.uv-fill-very_high {
		fill: var(--sev-red);
	}
	.uv-fill-extreme {
		fill: var(--wind-5);
	}
	.uv-bg-low {
		background: var(--sev-green);
	}
	.uv-bg-moderate {
		background: var(--sev-yellow);
	}
	.uv-bg-high {
		background: var(--sev-orange);
	}
	.uv-bg-very_high {
		background: var(--sev-red);
	}
	.uv-bg-extreme {
		background: var(--wind-5);
	}
	.uv-pill {
		display: inline-block;
		margin-left: 4px;
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid var(--line);
	}
	.pol-line {
		fill: none;
		stroke-width: 1.7;
	}
	.pol-pm25 {
		stroke: var(--accent);
	}
	.pol-pm25-bg {
		background: var(--accent);
	}
	.pol-pm10 {
		stroke: var(--wind-2);
	}
	.pol-pm10-bg {
		background: var(--wind-2);
	}
	.pol-o3 {
		stroke: var(--wind-4);
	}
	.pol-o3-bg {
		background: var(--wind-4);
	}
	.pol-no2 {
		stroke: var(--sev-orange);
	}
	.pol-no2-bg {
		background: var(--sev-orange);
	}
	.pol-dust {
		stroke: var(--muted);
		stroke-dasharray: 4 2;
	}
	.pol-dust-bg {
		background: var(--muted);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.sw {
		display: inline-block;
		width: 12px;
		height: 3px;
		border-radius: 2px;
		flex: none;
	}
	.sw-accent {
		background: var(--accent);
	}
	.sw-ink {
		background: var(--ink);
	}
	.sw-dash {
		border-top: 2px dashed var(--muted);
		height: 0;
	}
	.sw-dew {
		border-top: 2px dotted var(--wind-2);
		height: 0;
	}
	.sw-rain {
		height: 8px;
		background: var(--surf-q2);
	}
	.sw-cl-low {
		height: 8px;
		background: color-mix(in srgb, var(--muted) 64%, transparent);
	}
	.sw-cl-mid {
		height: 8px;
		background: color-mix(in srgb, var(--muted) 40%, transparent);
	}
	.sw-cl-high {
		height: 8px;
		background: color-mix(in srgb, var(--muted) 22%, transparent);
	}
	.sw-solar {
		height: 8px;
		background: color-mix(in srgb, var(--sev-yellow) 45%, transparent);
	}
	.compare {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.comp-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.comp-list li {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.comp-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 10px;
	}
	.comp-bars {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.comp-row {
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr) 74px;
		align-items: center;
		gap: 8px;
	}
	.comp-track {
		height: 10px;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: 4px;
		overflow: hidden;
		display: block;
	}
	.comp-fill {
		display: block;
		height: 100%;
		border-radius: 3px;
	}
	.comp-fill.fc {
		background: var(--accent);
	}
	.comp-fill.obs {
		background: var(--wind-2);
	}
	.comp-val {
		text-align: right;
		white-space: nowrap;
	}
</style>
