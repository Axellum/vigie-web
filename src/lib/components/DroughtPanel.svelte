<script lang="ts">
	// VigiEau French drought restrictions for a place (`GET /v1/point.drought` + `GET /v1/drought`).
	// Renders FR + EN restriction levels, affected water types (`AEP`, `SUP`, `SOU`), ambiguous zone/water-type note,
	// prefectural decree PDFs and usages. Omitted cleanly outside covered FR/DROM zones (`outside_coverage`).
	import {
		droughtLevelLabel,
		droughtSeverityTone,
		droughtText,
		waterTypeLabel,
		type DroughtResponse,
		type DroughtStatus,
		type DroughtWaterType
	} from '#lib/drought.js';
	import type { Lang } from '#lib/i18n.js';

	let {
		lang,
		status = null,
		detail = null
	}: {
		lang: Lang;
		status?: DroughtStatus | null;
		detail?: DroughtResponse | null;
	} = $props();

	const effectiveStatus = $derived(detail?.status ?? status?.status ?? null);
	const hidden = $derived(
		!effectiveStatus || effectiveStatus === 'outside_coverage' || effectiveStatus === 'invalid_query'
	);
	const maxLevel = $derived(detail?.maxLevel ?? status?.maxLevel ?? null);
	const tone = $derived(droughtSeverityTone(maxLevel));
	const department = $derived(detail?.department ?? status?.department ?? null);
	const zones = $derived(detail?.zones ?? []);
	const summaryZones = $derived(status?.zones ?? []);
	const ambiguousTypes = $derived(detail?.ambiguousWaterTypes ?? []);
	const unavailableTypes = $derived(
		Object.entries(detail?.availability ?? status?.availability ?? {})
			.filter(([, a]) => a.status === 'unavailable')
			.map(([wt]) => wt as DroughtWaterType)
	);
	const formatTypes = (types: readonly DroughtWaterType[]) =>
		types.map((wt) => waterTypeLabel(lang, wt)).join(', ');
</script>

{#if !hidden}
	<section class="drought" aria-labelledby="drought-heading">
		<div class="head">
			<h3 id="drought-heading">
				{droughtText(lang, 'title')}{#if department}
					<span class="muted small"> · {department}</span>
				{/if}
			</h3>
			{#if maxLevel}
				<span class="badge sev-{tone ?? 'NONE'}">{droughtLevelLabel(lang, maxLevel)}</span>
			{/if}
		</div>

		{#if detail?.stale}
			<p class="note small">{droughtText(lang, 'stale')}</p>
		{/if}

		{#if effectiveStatus === 'ambiguous_commune' && ambiguousTypes.length}
			<p class="note small">
				{droughtText(lang, 'ambiguousCommune', { types: formatTypes(ambiguousTypes) })}
			</p>
		{:else if ambiguousTypes.length}
			<p class="note small">{droughtText(lang, 'ambiguousNote', { types: formatTypes(ambiguousTypes) })}</p>
		{/if}

		{#if maxLevel}
			<p class="small">
				{maxLevel === 'vigilance'
					? droughtText(lang, 'restrictionsVigilance')
					: droughtText(lang, 'restrictionsYes', { level: droughtLevelLabel(lang, maxLevel) })}
			</p>
		{:else if effectiveStatus === 'confirmed_none'}
			<p class="muted small">{droughtText(lang, 'noneInForce')}</p>
		{:else if effectiveStatus === 'unavailable'}
			<p class="note small">{droughtText(lang, 'unavailableNote')}</p>
		{/if}

		{#if unavailableTypes.length && effectiveStatus !== 'unavailable'}
			<p class="muted small">
				{droughtText(lang, 'partialUnavailable', { types: formatTypes(unavailableTypes) })}
			</p>
		{/if}

		{#if zones.length}
			<ul class="zones">
				{#each zones as z (z.id + ':' + z.waterType)}
					{@const zTone = droughtSeverityTone(z.level)}
					<li class="zone">
						<div class="zhead">
							<span class="zname">
								<strong>{z.name}</strong>
								<span class="muted small"> · {waterTypeLabel(lang, z.waterType)}</span>
							</span>
							{#if z.level}
								<span class="badge sev-{zTone ?? 'NONE'}">{droughtLevelLabel(lang, z.level)}</span>
							{/if}
						</div>
						{#if z.influencedResource}
							<p class="muted small">{droughtText(lang, 'influencedResource')}</p>
						{/if}
						{#if z.decree?.pdfUrl || z.decree?.frameworkPdfUrl || z.municipalDecreeUrl || z.decree?.validUntil}
							<p class="links small">
								{#if z.decree?.validUntil}
									<span class="muted">{droughtText(lang, 'validUntil', { date: z.decree.validUntil })}</span>
								{/if}
								{#if z.decree?.pdfUrl}
									<a href={z.decree.pdfUrl} target="_blank" rel="noopener noreferrer"
										>{droughtText(lang, 'decreePdf')}</a
									>
								{/if}
								{#if z.decree?.frameworkPdfUrl}
									<a href={z.decree.frameworkPdfUrl} target="_blank" rel="noopener noreferrer"
										>{droughtText(lang, 'frameworkPdf')}</a
									>
								{/if}
								{#if z.municipalDecreeUrl}
									<a href={z.municipalDecreeUrl} target="_blank" rel="noopener noreferrer"
										>{droughtText(lang, 'municipalDecree')}</a
									>
								{/if}
							</p>
						{/if}
						{#if z.usages.length}
							<details class="usages">
								<summary class="small">{droughtText(lang, 'usages', { n: z.usages.length })}</summary>
								<ul class="usage-list">
									{#each z.usages as u, idx (u.id ?? idx)}
										<li class="small">
											<strong>{u.name}</strong>
											<span class="muted">({u.theme})</span>
											{#if u.description}
												— {u.description}{/if}
										</li>
									{/each}
								</ul>
							</details>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if summaryZones.length}
			<ul class="zones">
				{#each summaryZones as z (z.id + ':' + z.waterType)}
					{@const zTone = droughtSeverityTone(z.level)}
					<li class="zone">
						<div class="zhead">
							<span class="zname">
								<strong>{z.name}</strong>
								<span class="muted small"> · {waterTypeLabel(lang, z.waterType)}</span>
							</span>
							{#if z.level}
								<span class="badge sev-{zTone ?? 'NONE'}">{droughtLevelLabel(lang, z.level)}</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="small">
			<a href="https://vigieau.gouv.fr/" target="_blank" rel="noopener noreferrer"
				>{droughtText(lang, 'officialCheck')}</a
			>
		</p>
	</section>
{/if}

<style>
	.drought {
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
	.head h3 {
		margin: 0;
		font-size: 16px;
	}
	.zones {
		list-style: none;
		padding: 0;
		margin: 4px 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.zone {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.zhead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin: 0;
	}
	.usages summary {
		cursor: pointer;
		color: var(--muted);
	}
	.usage-list {
		margin: 4px 0 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	p {
		margin: 0;
	}
</style>
