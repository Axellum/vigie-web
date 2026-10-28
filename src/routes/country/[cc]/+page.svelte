<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import AlertRow from '#lib/components/AlertRow.svelte';
	import CountryWarnings from '#lib/components/CountryWarnings.svelte';
	import Time from '#lib/components/Time.svelte';
	import { countryName, t, translator, type Key } from '#lib/i18n.js';
	import { byLevelThenTime, LEVELS, maxLevel, rank } from '#lib/levels.js';
	import { hazardRow, warningRow } from '#lib/rows.js';
	import { slug } from '#lib/transform.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const name = $derived(countryName(lang, data.cc));
	const warnings = $derived(data.warnings?.warnings ?? []);

	const counts = $derived(
		Object.fromEntries(LEVELS.map((l) => [l, warnings.filter((w) => w.level === l).length]))
	);
	const areas = $derived.by(() => {
		const map = new Map<string, typeof warnings>();
		for (const w of warnings) {
			const area = w.area ?? '–';
			map.set(area, [...(map.get(area) ?? []), w]);
		}
		return [...map.entries()]
			.map(([area, list]) => ({
				area,
				level: maxLevel(list.map((w) => w.level)),
				rows: list.map(warningRow).sort(byLevelThenTime)
			}))
			.sort((a, b) => rank(b.level) - rank(a.level) || a.area.localeCompare(b.area, lang));
	});
	const hazardRows = $derived(data.hazards.map(hazardRow).sort(byLevelThenTime));
</script>

<!-- Without an answer from the API the number of warnings is unknown: the description does not give one. -->
<Seo
	title={tr('country.title', { country: name })}
	description={!data.warnings
		? tr('country.title', { country: name })
		: warnings.length
			? tr('country.description', { country: name, n: warnings.length })
			: tr('country.descriptionNone', { country: name })}
/>

<div class="page">
	<header class="intro">
		<p class="eyebrow"><a href="/countries">{tr('nav.countries')}</a></p>
		<h1>{tr('country.title', { country: name })}</h1>
		{#if data.fetchedAt}
			<p class="muted small">{tr('updated', { time: '' })} <Time {lang} unix={data.fetchedAt} /></p>
		{/if}
		{#if data.stale && data.fetchedAt}
			<p class="note">{tr('country.stale', { time: '' })} <Time {lang} unix={data.fetchedAt} /></p>
		{/if}
		{#if data.apiDown}
			<p class="note">{tr('error.api')}</p>
		{/if}
		{#if data.accounts}
			<p class="small">
				<a href="/account/zones/new?country={data.cc}" rel="nofollow">{tr('zones.watchCountry')}</a>
			</p>
		{/if}
	</header>

	{#if data.warnings}
		<div class="summary">
			{#each LEVELS as level (level)}
				<div class="count sev-{level}">
					<span class="n data">{counts[level]}</span><span class="t">{t(lang, `level.${level}` as Key)}</span>
				</div>
			{/each}
		</div>

		<CountryWarnings {lang} cc={data.cc} {warnings} hazards={data.hazards} frame={data.box} now={data.now} />

		{#if warnings.length === 0}
			<p>{tr('country.none')}</p>
		{:else}
			<section class="block">
				<h2>{tr('country.areas')}</h2>
				<div class="areas">
					{#each areas as group (group.area)}
						<div class="area card">
							<h3>
								{#if group.area !== '–'}
									<a href="/country/{data.cc.toLowerCase()}/{slug(group.area)}">{group.area}</a>
								{:else}
									–
								{/if}
							</h3>
							<div class="list">
								{#each group.rows as row (row.key)}
									<AlertRow {lang} {row} now={data.now} />
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="block">
			<h2>{tr('country.coverage')}</h2>
			<ul class="coverage">
				{#each data.warnings.coverage as c (c.source + c.country)}
					<li>
						<strong>{c.source}</strong>
						{#if c.status !== 'ok'}<span class="note">{tr('country.unavailable')}</span>{/if}
						{#if c.note}<span class="muted small">{c.note}</span>{/if}
					</li>
				{/each}
			</ul>
			{#each data.warnings.attributions as a (a)}<p class="credit">{a}</p>{/each}
			{#if data.warnings.disclaimer}<p class="credit">{data.warnings.disclaimer}</p>{/if}
		</section>
	{/if}

	{#if hazardRows.length}
		<section class="block">
			<h2>{tr('country.hazards')}</h2>
			<div class="list">
				{#each hazardRows as row (row.key)}
					<AlertRow {lang} {row} now={data.now} />
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		max-width: 520px;
	}
	.count {
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding: 10px 10px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.count::before {
		content: '';
		position: absolute;
		inset: 0 0 auto 0;
		height: 4px;
		background: var(--c);
	}
	.count .n {
		font-size: 24px;
	}
	.count .t {
		font-size: 12.5px;
		color: var(--muted);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.areas {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
		gap: 12px;
	}
	.area {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.area h3 {
		font-size: 18px;
	}
	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.coverage {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.coverage .note {
		margin-left: 6px;
		padding: 2px 6px;
	}
</style>
