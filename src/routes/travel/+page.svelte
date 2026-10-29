<script lang="ts">
	// Travel advice: each ministry's advice for every country, on a map (one ministry at a time) and in a list, the
	// countries where the ministries disagree (Vigie's comparison), and the ECDC's recent publications.
	import { goto } from '$app/navigation';
	import Credits from '#lib/components/Credits.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { countryName, t } from '#lib/i18n.js';
	import type { Borders } from '#lib/near.js';
	import { kindLabel, legend, travel, travelDate, whyNotRead } from '#lib/travel.js';
	import type { FeatureCollection } from 'geojson';

	let { data } = $props();
	const lang = $derived(data.lang);
	const read = $derived(data.ministries.filter((m) => m.read));
	const notRead = $derived(data.ministries.filter((m) => !m.read));

	let chosen = $state<string | null>(null);
	const ministry = $derived(read.find((m) => m.id === chosen) ?? read[0] ?? null);
	const shortName = (id: string) => {
		const m = data.ministries.find((x) => x.id === id);
		return m ? countryName(lang, m.country) : id.toUpperCase();
	};

	// The borders (100 kB) come after the page: the list is there first.
	let borders = $state<Borders | null>(null);
	$effect(() => {
		if (!borders) import('#lib/data/borders.json').then((m) => (borders = m.default as unknown as Borders));
	});
	const zones = $derived.by<FeatureCollection>(() => {
		const b = borders;
		const id = ministry?.id;
		if (!b || !id) return { type: 'FeatureCollection', features: [] };
		return {
			type: 'FeatureCollection',
			features: data.rows
				.filter((r) => b[r.cc] && r.marks[id])
				.map((r) => ({
					type: 'Feature',
					properties: { key: r.cc, level: r.marks[id] },
					geometry: { type: 'MultiPolygon', coordinates: b[r.cc] }
				}))
		};
	});

	let query = $state('');
	const named = $derived(
		data.rows
			.map((r) => ({ ...r, name: countryName(lang, r.cc) }))
			.sort((a, b) => a.name.localeCompare(b.name, lang))
	);
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? named.filter((r) => r.name.toLowerCase().includes(q) || r.cc.toLowerCase() === q) : named;
	});
	const disagreements = $derived(
		named
			.filter((r) => r.disagree)
			.sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0) || a.name.localeCompare(b.name, lang))
	);
	const linked = $derived(data.health ? data.health.agencies.filter((a) => !a.read) : []);
	const levelWord = (id: string, level: string | null) => {
		const m = read.find((x) => x.id === id);
		const item = m && level ? legend(lang, m).find((l) => l.level === level) : null;
		return item ? item.text : t(lang, 'level.none');
	};
</script>

<Seo title={travel(lang, 'page')} description={travel(lang, 'pageIntro')} />

<div class="page">
	<header class="intro">
		<h1>{travel(lang, 'page')}</h1>
		<p class="muted">{travel(lang, 'pageIntro')}</p>
		{#if data.apiDown}<p class="note">{travel(lang, 'unavailable')}</p>{/if}
	</header>

	{#if read.length && ministry}
		<section class="block">
			<div class="choose" role="radiogroup" aria-label={travel(lang, 'mapOf')}>
				<span class="muted small">{travel(lang, 'mapOf')}</span>
				{#each read as m (m.id)}
					<button
						type="button"
						role="radio"
						aria-checked={m.id === ministry.id}
						class:on={m.id === ministry.id}
						onclick={() => (chosen = m.id)}>{countryName(lang, m.country)}</button
					>
				{/each}
			</div>
			<p class="small">
				<strong>{ministry.name}</strong>{#if ministry.state && ministry.state !== 'ok'}
					· <span class="muted">{travel(lang, ministry.state === 'loading' ? 'loading' : 'stale')}</span>{/if}
			</p>
			<div class="map">
				<MapView
					{lang}
					{zones}
					globe
					label={`${travel(lang, 'page')} · ${ministry.name}`}
					onselect={(s) => {
						if (s.kind === 'zone') goto(`/travel/${s.key.toLowerCase()}`);
					}}
				/>
			</div>
			<ul class="legend">
				{#each legend(lang, ministry) as item (item.level)}
					<li>
						<span class="swatch sev-{item.level}"></span>
						<span lang={item.language}>{item.text}</span>
						{#if item.ours}<span class="muted small">({travel(lang, 'oursLabel')})</span>{/if}
					</li>
				{/each}
				<li><span class="swatch sev-NONE"></span><span>{t(lang, 'level.none')}</span></li>
			</ul>
			<p class="muted small">{travel(lang, 'mapNote')}</p>
		</section>

		{#if disagreements.length}
			<section class="block">
				<h2>{travel(lang, 'disagreements')} ({disagreements.length})</h2>
				<p class="muted small">{travel(lang, 'disagreementsNote')}</p>
				<ul class="chips">
					{#each disagreements as r (r.cc)}
						<li>
							<a href="/travel/{r.cc.toLowerCase()}">{r.name}</a>
							<span class="muted small">{travel(lang, 'disagree', { gap: r.gap ?? '–' })}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="block">
			<h2>{travel(lang, 'countries')}</h2>
			<label class="search">
				<span class="muted small">{travel(lang, 'search')}</span>
				<input type="search" bind:value={query} autocomplete="off" />
			</label>
			<div class="table" role="table" aria-label={travel(lang, 'countries')} style="--n: {read.length}">
				<div class="row head" role="row">
					<span role="columnheader">{travel(lang, 'country')}</span>
					{#each read as m (m.id)}<span role="columnheader" class="mark" title={m.name}>{m.country}</span
						>{/each}
				</div>
				{#each shown as r (r.cc)}
					<div class="row" role="row">
						<a role="cell" href="/travel/{r.cc.toLowerCase()}"
							>{r.name}{#if r.disagree}<span
									class="flag"
									title={travel(lang, 'disagree', { gap: r.gap ?? '–' })}>≠</span
								>{/if}</a
						>
						{#each read as m (m.id)}
							{@const level = r.marks[m.id] ?? null}
							<span role="cell" class="mark"
								><span
									class="dot sev-{level ?? 'NONE'}"
									title={`${shortName(m.id)} : ${levelWord(m.id, level)}`}
									aria-label={`${shortName(m.id)} : ${levelWord(m.id, level)}`}
								></span></span
							>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if notRead.length}
		<section class="block">
			<h2>{travel(lang, 'notRead')}</h2>
			<ul class="plain">
				{#each notRead as m (m.id)}
					<li>
						{#if m.url}<a href={m.url} rel="noopener">{m.name}</a>{:else}{m.name}{/if}
						<span class="muted small">{whyNotRead(lang, m)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.health}
		<section class="block">
			<h2>{travel(lang, 'health')}</h2>
			<p class="muted small">{travel(lang, 'healthIntro')}</p>
			<ul class="plain">
				{#each data.health.items.slice(0, 8) as item (item.url)}
					<li>
						<a href={item.url} rel="noopener" lang="en">{item.title}</a>
						<span class="muted small"
							>· {travelDate(lang, item.published)} · {kindLabel(lang, item.kind)}</span
						>
					</li>
				{/each}
			</ul>
			{#if linked.length}
				<p class="small">
					{travel(lang, 'healthAlso')}
					{#each linked as a, i (a.id)}{#if i},
						{/if}{#if a.url}<a href={a.url} rel="noopener">{a.name}</a>{:else}{a.name}{/if}{/each}
				</p>
			{/if}
		</section>
	{/if}

	{#if data.generated}<p class="muted small">
			{travel(lang, 'checked')} : {travelDate(lang, data.generated)}
		</p>{/if}
	<Credits {lang} credits={[data.attribution, data.health?.attribution]} />
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}
	.note {
		background: var(--accent-soft);
		border-radius: var(--radius);
		padding: 8px 10px;
		font-size: 14px;
	}
	.choose {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.choose button {
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		border-radius: 999px;
		padding: 4px 12px;
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.choose button.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.map {
		height: min(60vh, 460px);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		font-size: 14px;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--c);
		flex: none;
	}
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
		gap: 6px 16px;
	}
	.search {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 320px;
	}
	.search input {
		font: inherit;
		padding: 6px 8px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
	}
	.table {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) repeat(var(--n, 5), 36px);
		align-items: center;
		gap: 4px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line);
	}
	.row.head {
		font-size: 12px;
		color: var(--muted);
		font-weight: 600;
	}
	.mark {
		text-align: center;
	}
	.dot {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--c);
	}
	.flag {
		margin-left: 6px;
		color: var(--accent);
		font-weight: 700;
	}
	.plain {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
