<script lang="ts">
	// The pollen of a place (`GET /v1/pollens`, CAMS Europe): the peak of each day for the species above one grain per m³,
	// as figures, with no health level made up (the API gives none). Shown in the air card.
	import { calendarDay, number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { pollenPeaks, pollenText, speciesLabel, type PollensResponse } from '#lib/pollens.js';

	let { lang, value }: { lang: Lang; value: PollensResponse } = $props();
	const peaks = $derived(pollenPeaks(value));
	// The days follow each other from today: the day of the week is enough in a narrow card, the date is in the title.
	const weekday = (iso: string) => calendarDay(lang, iso, true).split(' ')[0].replace(/\.$/, '');
</script>

<section class="pollen" aria-labelledby="pollen-heading">
	<h3 id="pollen-heading">{pollenText(lang, 'title')}</h3>
	{#if value.stale}
		<p class="note small">{pollenText(lang, 'stale')}</p>
	{/if}
	{#if peaks.length}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">{pollenText(lang, 'species')}</th>
						{#each value.daily as d (d.date)}
							<th scope="col" title={calendarDay(lang, d.date)}>{weekday(d.date)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each peaks as p (p.species)}
						<tr>
							<th scope="row">{speciesLabel(lang, p.species)}</th>
							{#each value.daily as d (d.date)}
								{@const v = d.max[p.species]}
								<td class:peak={v != null && v === p.peak}>{v == null ? '–' : number(lang, v, 0)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted small">{pollenText(lang, 'unit')}</p>
	{:else}
		<p class="muted small">{pollenText(lang, 'none')}</p>
	{/if}
	<p class="muted small">{pollenText(lang, 'model')}</p>
</section>

<style>
	.pollen {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	h3 {
		margin: 0;
		font-size: 16px;
	}
	.scroll {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 3px 5px;
		text-align: right;
		white-space: nowrap;
	}
	th[scope='row'],
	thead th:first-child {
		text-align: left;
		font-weight: 500;
	}
	thead th {
		color: var(--muted);
		font-weight: 500;
	}
	tbody tr + tr {
		border-top: 1px solid var(--line);
	}
	.peak {
		font-weight: 700;
	}
	p {
		margin: 0;
	}
</style>
