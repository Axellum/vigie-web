<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { countryName, tOr, translator } from '$lib/i18n';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const countries = $derived(
		data.served
			.map((c) => ({ cc: c.country, name: countryName(lang, c.country), verified: c.licenceVerified }))
			.sort((a, b) => a.name.localeCompare(b.name, lang))
	);
	// The most specific reasons first; the countries with no known source at all last.
	const REASONS = [
		'law_restricts',
		'redistribution_forbidden',
		'terms_restrict',
		'terms_contradictory',
		'licence_unverified',
		'source_off',
		'no_source'
	];
	const groups = $derived.by(() => {
		const byCode = new Map<string, string[]>();
		for (const u of data.uncovered) {
			const code = u.reasonCode && REASONS.includes(u.reasonCode) ? u.reasonCode : 'other';
			byCode.set(code, [...(byCode.get(code) ?? []), countryName(lang, u.country)]);
		}
		return [...REASONS, 'other']
			.filter((code) => byCode.has(code))
			.map((code) => ({ code, names: byCode.get(code)!.sort((a, b) => a.localeCompare(b, lang)) }));
	});
</script>

<Seo title={tr('countries.title')} description={tr('countries.intro')} />

<div class="page">
	<header class="intro">
		<h1>{tr('countries.title')}</h1>
		<p class="muted">{tr('countries.intro')}</p>
		{#if !data.apiDown}<p class="muted">{tr('countries.count', { n: countries.length })}</p>{/if}
	</header>
	{#if data.apiDown}<p class="note">{tr('error.api')}</p>{/if}
	<ul class="grid">
		{#each countries as c (c.cc)}
			<li>
				<a href="/country/{c.cc.toLowerCase()}">
					<span class="code data">{c.cc}</span>
					<span>
						{c.name}
						{#if !c.verified}<span class="muted small licence">{tr('countries.licence')}</span>{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
	{#if data.uncovered.length}
		<section class="uncovered">
			<h2>{tr('countries.uncoveredTitle')}</h2>
			<p class="muted">{tr('countries.uncoveredIntro', { n: data.uncovered.length })}</p>
			{#each groups as g (g.code)}
				<h3>{tOr(lang, `uncovered.${g.code}`, g.code)} · <span class="data">{g.names.length}</span></h3>
				<p class="names">{g.names.join(', ')}</p>
			{/each}
		</section>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 70ch;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: 6px 16px;
	}
	.grid a {
		display: flex;
		gap: 10px;
		align-items: baseline;
		padding: 8px 10px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.grid a:hover {
		border-color: var(--accent);
	}
	.code {
		color: var(--muted);
		font-size: 12px;
	}
	.licence {
		display: block;
	}
	.uncovered {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 80ch;
		margin-top: 12px;
	}
	.uncovered h3 {
		margin: 8px 0 0;
		font-size: 15px;
	}
	.names {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
</style>
