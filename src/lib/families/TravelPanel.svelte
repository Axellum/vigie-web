<script lang="ts">
	// The travel family in the side panel of the home map: the ministry whose advice colours the countries (one at a time, as
	// on the travel page), how many countries each colour has with the ministry's words, and the way to the travel page. The
	// card of a country touched on the map sets the ministries side by side (`TravelCard`).
	import Credits from '#lib/components/Credits.svelte';
	import { TRAVEL_LEVELS, type TravelFamily } from '#lib/families/travelFamily.svelte.js';
	import { countryName, translator, type Lang } from '#lib/i18n.js';
	import { legend, travel } from '#lib/travel.js';

	let { lang, trips }: { lang: Lang; trips: TravelFamily } = $props();
	const tr = $derived(translator(lang));
	const words = $derived(trips.ministry ? legend(lang, trips.ministry) : []);
	const wordOf = (level: string) => words.find((w) => w.level === level) ?? null;
</script>

<section class="trips" aria-labelledby="trips-title">
	<p class="eyebrow">{tr('frame.family.travel')}</p>
	<h2 id="trips-title">{tr('travelFamily.title')}</h2>
	<p class="muted small">{travel(lang, 'pageIntro')}</p>
	{#if trips.status === 'ok' && trips.ministry}
		<div class="chips" role="radiogroup" aria-label={travel(lang, 'mapOf')}>
			{#each trips.read as m (m.id)}
				<button
					type="button"
					role="radio"
					class="chip"
					aria-checked={m.id === trips.ministry.id}
					onclick={() => (trips.chosen = m.id)}>{countryName(lang, m.country)}</button
				>
			{/each}
		</div>
		<p class="small"><strong>{trips.ministry.name}</strong></p>
		<ul class="counts">
			{#each TRAVEL_LEVELS as level (level)}
				{@const w = wordOf(level)}
				{#if w}
					<li class="sev-{level}">
						<b>{trips.counts[level]}</b>
						<span lang={w.language}>{w.text}</span>
					</li>
				{/if}
			{/each}
		</ul>
		<p class="muted small">{tr('travelFamily.pick')} {travel(lang, 'mapNote')}</p>
		<p class="links small"><a href="/travel">{tr('travelFamily.page')}</a></p>
		<Credits {lang} credits={[trips.attribution]} />
	{:else if trips.status === 'failed'}
		<p class="note">{travel(lang, 'unavailable')}</p>
	{:else}
		<p class="muted">{tr('travelFamily.loading')}</p>
	{/if}
</section>

<style>
	.trips {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h2 {
		font: 700 26px/1.05 var(--font-display);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		min-height: 34px;
		padding: 4px 12px;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: var(--surface);
		color: inherit;
		font: 600 14px/1.2 var(--font-body);
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--accent);
	}
	.chip[aria-checked='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--surface);
	}
	.counts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}
	.counts li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 10px;
		border-left: 5px solid var(--c);
		background: color-mix(in srgb, var(--c) 14%, var(--surface));
		font-size: 13px;
		line-height: 1.25;
	}
	.counts b {
		font: 700 22px/1 var(--font-display);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
</style>
