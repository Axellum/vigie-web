<script lang="ts">
	// The official avalanche bulletin of a place (`GET /v1/avalanches`: SLF, Avalanche.report, Météo-France): the danger
	// level on the European scale (per band of altitude when it changes with it), the problems with their altitude and
	// aspects, and the service's own texts as it wrote them. Off season it says there is no current bulletin; outside the
	// services' areas it is not shown.
	import {
		aspectLabel,
		avalancheLevelLabel,
		avalancheProblemLabel,
		avalancheServiceUrl,
		avalancheText,
		avalancheTone,
		elevationText,
		originalLabel,
		ratingBands,
		type AvalanchesResponse
	} from '#lib/avalanches.js';
	import type { Lang } from '#lib/i18n.js';

	let { lang, value }: { lang: Lang; value: AvalanchesResponse } = $props();
	const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB' };
	const until = (iso: string | null) =>
		iso
			? new Intl.DateTimeFormat(LOCALE[lang], {
					weekday: 'short',
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				}).format(new Date(iso))
			: null;
</script>

<section class="avalanche" aria-labelledby="avalanche-heading">
	<div class="head">
		<h3 id="avalanche-heading">{avalancheText(lang, 'title')}</h3>
		{#if value.maxLevel}
			<span class="pill sev-{avalancheTone(value.maxLevel)}">{avalancheLevelLabel(lang, value.maxLevel)}</span
			>
		{/if}
	</div>
	{#if value.regionName}
		<p class="small">{avalancheText(lang, 'region', { name: value.regionName })}</p>
	{/if}
	{#if value.stale}
		<p class="note small">{avalancheText(lang, 'stale')}</p>
	{/if}
	{#if value.status === 'active' && value.bulletins.length}
		{#each value.bulletins as b (b.id)}
			{#if until(b.validUntil)}
				<p class="muted small">{avalancheText(lang, 'valid', { date: until(b.validUntil) ?? '' })}</p>
			{/if}
			{@const bands = ratingBands(b)}
			{#if bands.length}
				<p class="bands small">
					{#each bands as r, i (i)}
						<span class="band"
							><span class="pill sev-{avalancheTone(r.level)}">{r.level}</span>
							{elevationText(lang, r)}</span
						>
					{/each}
				</p>
			{/if}
			{#if b.highlights}
				<p class="small" lang={b.lang ?? undefined}>{b.highlights}</p>
			{/if}
			{#if b.problems.length}
				<ul class="problems">
					{#each b.problems as p, i (i)}
						{@const band = elevationText(lang, p)}
						<li>
							<strong>{avalancheProblemLabel(lang, p.type)}</strong>
							{#if band || p.aspects.length}
								<span class="muted small">
									· {[
										band,
										p.aspects.length
											? avalancheText(lang, 'aspects', {
													list: p.aspects.map((a) => aspectLabel(lang, a)).join(', ')
												})
											: null
									]
										.filter(Boolean)
										.join(', ')}
								</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{@const texts = [...new Set(b.problems.map((p) => p.comment).filter((t): t is string => t != null))]}
			{#if texts.length || b.activity || b.snowpack || b.tendency}
				<details class="texts">
					<summary class="small">{originalLabel(lang, b.lang)}</summary>
					<div class="body small" lang={b.lang ?? undefined}>
						{#each texts as t (t)}<p>{t}</p>{/each}
						{#if b.activity}
							<p><strong>{avalancheText(lang, 'activity')}.</strong> {b.activity}</p>
						{/if}
						{#if b.snowpackTitle || b.snowpack}
							<p>
								<strong>{avalancheText(lang, 'snowpack')}.</strong>
								{#if b.snowpackTitle}<em>{b.snowpackTitle}</em>{/if}
								{b.snowpack ?? ''}
							</p>
						{/if}
						{#if b.tendency}
							<p><strong>{avalancheText(lang, 'tendency')}.</strong> {b.tendency}</p>
						{/if}
					</div>
				</details>
			{/if}
			<p class="small">
				<a href={b.url ?? avalancheServiceUrl(b.source)} target="_blank" rel="noopener noreferrer"
					>{avalancheText(lang, 'official')}</a
				>
			</p>
		{/each}
		<p class="muted small">{avalancheText(lang, 'advice')}</p>
	{:else}
		<p class="muted small">{avalancheText(lang, 'none')}</p>
		<p class="small">
			<a href={avalancheServiceUrl(value.coveredBy)} target="_blank" rel="noopener noreferrer"
				>{avalancheText(lang, 'official')}</a
			>
		</p>
	{/if}
</section>

<style>
	.avalanche {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	h3 {
		margin: 0;
		font-size: 16px;
	}
	.bands {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.band .pill {
		margin-right: 4px;
	}
	.body p {
		white-space: pre-line;
	}
	.problems {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.texts summary {
		cursor: pointer;
		color: var(--muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
	}
	p {
		margin: 0;
	}
</style>
