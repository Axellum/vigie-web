<script lang="ts">
	// The natural disasters the French State recognised in the commune of a place (`GET /v1/history/catnat`, GASPAR):
	// the count by kind, then the decrees, most recent first. History, not a warning; the commune is named, because the API
	// matches the nearest commune centre to the rounded position.
	import { catnatText, catnatTypeLabel, type CatNatResponse } from '#lib/catnat.js';
	import { calendarDay, number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';

	let { lang, value }: { lang: Lang; value: CatNatResponse } = $props();
	const SHOWN = 8;
	const c = $derived(value.commune);
	const shown = $derived(value.decrees.slice(0, SHOWN));
	const older = $derived(Math.max(0, value.total - shown.length));
</script>

<section class="catnat" aria-labelledby="catnat-heading">
	<h3 id="catnat-heading">{catnatText(lang, 'title')}</h3>
	{#if c}
		<p class="small">
			{c.distanceKm != null && c.distanceKm >= 1
				? catnatText(lang, 'communeNear', {
						name: c.name,
						department: c.department ?? '',
						km: number(lang, c.distanceKm, 0)
					})
				: catnatText(lang, 'commune', { name: c.name, department: c.department ?? '' })}
		</p>
	{/if}
	{#if value.status === 'available' && value.total > 0}
		{#if value.periodStart && value.periodEnd}
			<p class="muted small">
				{catnatText(lang, 'intro', {
					from: calendarDay(lang, value.periodStart),
					to: calendarDay(lang, value.periodEnd)
				})}
			</p>
		{/if}
		<p class="kinds">
			{#each value.byType as t (t.category)}
				<span class="kind"><strong>{t.count}</strong> {catnatTypeLabel(lang, t.category, t.typeLabel)}</span>
			{/each}
		</p>
		<ul>
			{#each shown as d, i (i)}
				<li class="small">
					<strong>{catnatTypeLabel(lang, d.category, d.typeLabel)}</strong>
					·
					{d.startDate && d.endDate && d.startDate !== d.endDate
						? catnatText(lang, 'event', {
								start: calendarDay(lang, d.startDate),
								end: calendarDay(lang, d.endDate)
							})
						: catnatText(lang, 'eventDay', { start: calendarDay(lang, d.startDate) })}
					{#if d.decreeDate}
						<span class="muted"
							>({catnatText(lang, 'decree', { date: calendarDay(lang, d.decreeDate) })})</span
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if older > 0}
			<p class="muted small">{catnatText(lang, 'older', { n: older })}</p>
		{/if}
	{:else}
		<p class="muted small">{catnatText(lang, 'none')}</p>
	{/if}
	<p class="muted small">{catnatText(lang, 'history')}</p>
	<p class="small">
		<a href="https://www.georisques.gouv.fr/" target="_blank" rel="noopener noreferrer"
			>{catnatText(lang, 'official')}</a
		>
	</p>
</section>

<style>
	.catnat {
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
	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	ul {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	p {
		margin: 0;
	}
</style>
