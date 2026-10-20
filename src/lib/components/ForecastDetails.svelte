<script lang="ts">
	// What a hazard's forecast says, in words: a storm's forecast positions and coastal warnings, a tsunami's
	// estimated arrival times. Every value is the source's; the labels of the warnings are its own words.
	import { number } from '$lib/format';
	import { translator, type Lang } from '$lib/i18n';
	import type { HazardForecast } from '$lib/types';
	import Time from './Time.svelte';

	// `level` is the level of the section's heading: 2 on a hazard's own page, 3 under the side panel's title.
	// `credited` is the credit already shown above (the hazard's): the same words are not repeated.
	let {
		lang,
		forecast,
		level = 3,
		credited = null
	}: { lang: Lang; forecast: HazardForecast; level?: 2 | 3; credited?: string | null } = $props();
	const tr = $derived(translator(lang));

	type Props = Record<string, unknown>;
	const of = (kind: string): Props[] =>
		forecast.features.features
			.filter((f) => f.properties?.kind === kind)
			.map((f) => (f.properties ?? {}) as Props);
	const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
	const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

	const positions = $derived(of('position').sort((a, b) => (n(a.tau_h) ?? 0) - (n(b.tau_h) ?? 0)));
	const warnings = $derived([...new Set(of('watch_warning').map((w) => s(w.label) ?? s(w.code) ?? '–'))]);
	const arrivals = $derived(of('eta').sort((a, b) => (n(a.eta_utc) ?? 0) - (n(b.eta_utc) ?? 0)));
	const epicentre = $derived(of('epicentre')[0]);
	const wind = (p: Props) =>
		n(p.wind_kt) == null
			? '–'
			: `${number(lang, n(p.wind_kt), 0)} kt (${number(lang, n(p.wind_kmh), 0)} km/h)`;
</script>

<section class="forecast">
	<svelte:element this={`h${level}`} class="title">{tr('fc.title')}</svelte:element>
	<p class="muted small">
		{#if forecast.advisory}{tr('fc.advisory', { n: forecast.advisory })} ·{/if}
		{forecast.source ?? ''}
		{#if forecast.issued}· {tr('fc.issued')} <Time {lang} unix={forecast.issued} />{/if}
	</p>
	{#if forecast.advisoryUrl}
		<a href={forecast.advisoryUrl} rel="external noopener">{tr('fc.bulletin')}</a>
	{/if}

	{#if positions.length}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">{tr('fc.valid')}</th>
						<th scope="col">{tr('fc.wind')}</th>
						<th scope="col" class="num">{tr('fc.pressure')}</th>
						<th scope="col">{tr('fc.stage')}</th>
					</tr>
				</thead>
				<tbody>
					{#each positions as p, i (i)}
						<tr>
							<th scope="row">
								<span class="data">+{n(p.tau_h) ?? '–'} h</span>
								<span class="muted small"><Time {lang} unix={n(p.valid_utc)} /></span>
							</th>
							<td class="data">{wind(p)}</td>
							<td class="num data">{n(p.pressure_hpa) == null ? '–' : `${n(p.pressure_hpa)} hPa`}</td>
							<td>{s(p.stage) ?? '–'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted small">{tr('fc.coneNote')}</p>
	{/if}

	{#if warnings.length}
		<svelte:element this={`h${level + 1}`} class="sub">{tr('fc.warnings')}</svelte:element>
		<ul>
			{#each warnings as w (w)}<li>{w}</li>{/each}
		</ul>
	{/if}

	{#if epicentre}
		<dl class="facts">
			<dt>{tr('detail.magnitude')}</dt>
			<dd class="data">
				{n(epicentre.magnitude) == null ? '–' : `M ${number(lang, n(epicentre.magnitude))}`}
				{s(epicentre.magnitude_type) ?? ''}
			</dd>
			<dt>{tr('detail.depth')}</dt>
			<dd class="data">
				{n(epicentre.depth_km) == null ? '–' : `${number(lang, n(epicentre.depth_km))} km`}
			</dd>
			<dt>{tr('detail.time')}</dt>
			<dd><Time {lang} unix={n(epicentre.origin_utc)} /></dd>
		</dl>
	{/if}

	{#if arrivals.length}
		<svelte:element this={`h${level + 1}`} class="sub">{tr('fc.arrivals')}</svelte:element>
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">{tr('fc.place')}</th>
						<th scope="col">{tr('fc.eta')}</th>
					</tr>
				</thead>
				<tbody>
					{#each arrivals as a, i (i)}
						<tr>
							<th scope="row">{[s(a.place), s(a.region)].filter(Boolean).join(', ') || '–'}</th>
							<td><Time {lang} unix={n(a.eta_utc)} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted small">{tr('fc.etaNote')}</p>
	{/if}

	{#if !forecast.features.features.length}
		<p class="muted">
			{tr('fc.none')}{#if forecast.reason}: {forecast.reason}{/if}
		</p>
	{/if}
	{#if forecast.attribution && forecast.attribution !== credited}
		<p class="credit">{forecast.attribution}</p>
	{/if}
</section>

<style>
	.forecast {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.title {
		font-size: 17px;
	}
	.sub {
		font-size: 15px;
		margin-top: 4px;
	}
	ul {
		margin: 0;
		padding-left: 18px;
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
		padding: 5px 10px 5px 0;
		text-align: left;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
		vertical-align: top;
	}
	tbody th {
		font-weight: normal;
		display: flex;
		flex-direction: column;
	}
	thead th {
		font-size: 12.5px;
		color: var(--muted);
		font-weight: 600;
	}
	.num {
		text-align: right;
	}
</style>
