<script lang="ts">
	// The offshore buoys of Météo-France, grouped by sea: for each, the waves first (height, period, direction), then the water,
	// the wind and the pressure, and the hour of the record. Measures, not a forecast: the page says so first. Every figure is the
	// API's; what a buoy did not measure is left out.
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { number } from '#lib/format.js';
	import {
		basinOf,
		buoysText,
		waveDetails,
		waveHeight,
		windLine,
		type Basin,
		type SeaBuoy
	} from '#lib/sea/buoys.js';
	import { hourLabel } from '#lib/surf.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const t = (key: string, vars: Record<string, string | number> = {}) => buoysText(lang, key, vars);
	const answer = $derived(data.answer);

	const ORDER: Basin[] = ['mediterranean', 'atlantic', 'overseas'];
	const groups = $derived(
		ORDER.map((basin) => ({
			basin,
			buoys: (answer?.buoys ?? []).filter((b: SeaBuoy) => basinOf(b) === basin)
		})).filter((g) => g.buoys.length)
	);
	const temp = (c: number) => `${number(lang, c, 1)} °C`;
</script>

<Seo title={t('page')} description={t('meta')} />

<div class="page">
	<header class="intro">
		<p class="small"><a href="/sea">← {t('back')}</a></p>
		<h1>{t('title')}</h1>
		<p class="muted">{t('intro')}</p>
		<p class="note">{t('safety')}</p>
	</header>

	{#if !answer || answer.status === 'unavailable'}
		<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
	{:else if answer.status === 'not_configured'}
		<p class="note">{t('notConfigured')}</p>
	{:else if !answer.buoys.length}
		<p class="note">{t('none', { hours: answer.maxAgeHours ?? 3 })}</p>
	{:else}
		{#if data.stale}<p class="note">{t('stale')}</p>{/if}
		{#each groups as group (group.basin)}
			<section class="block">
				<h2>{t(`basin.${group.basin}`)}</h2>
				<ul class="buoys">
					{#each group.buoys as buoy (buoy.id)}
						{@const height = waveHeight(lang, buoy)}
						{@const details = waveDetails(lang, buoy)}
						{@const wind = windLine(lang, buoy)}
						<li class="card">
							<h3>{t('buoy', { name: buoy.name })}</h3>
							<p class="muted small">{t('measured', { time: hourLabel(lang, buoy.measured) })}</p>
							<dl>
								<dt>{t('waves')}</dt>
								<dd>
									{#if height}<b class="big">{height}</b>
										{#if details}<span class="muted small">· {details}</span>{/if}
									{:else}<span class="muted">{t('noWaves')}</span>{/if}
								</dd>
								{#if buoy.seaTempC != null}<dt>{t('sea')}</dt>
									<dd>{temp(buoy.seaTempC)}</dd>{/if}
								{#if wind}<dt>{t('wind')}</dt>
									<dd>{wind}</dd>{/if}
								{#if buoy.airTempC != null}<dt>{t('air')}</dt>
									<dd>{temp(buoy.airTempC)}</dd>{/if}
								{#if buoy.pressureHpa != null}<dt>{t('pressure')}</dt>
									<dd>{t('pressureValue', { hpa: number(lang, buoy.pressureHpa, 0) })}</dd>{/if}
							</dl>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}

	<Credits {lang} credits={[answer?.attribution]} />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.block h2 {
		margin: 0 0 8px;
	}
	.buoys {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 8px;
	}
	.card {
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		min-width: 0;
	}
	.card h3 {
		margin: 0;
		font-size: 1rem;
	}
	.card p {
		margin: 0 0 6px;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 10px;
		margin: 0;
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.big {
		font-size: 1.25rem;
	}
</style>
