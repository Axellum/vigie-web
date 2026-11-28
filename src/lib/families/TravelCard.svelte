<script lang="ts">
	// The card of a country touched on the travel map of the home page, over the right of the map: each ministry read and the
	// colour of its advice for the whole country, with its words, Vigie's comparison, and the way to the country's page.
	import type { TravelFamily } from '#lib/families/travelFamily.svelte.js';
	import { countryName, t, translator, type Lang } from '#lib/i18n.js';
	import { legend, travel } from '#lib/travel.js';

	let { lang, trips, onclose }: { lang: Lang; trips: TravelFamily; onclose: () => void } = $props();
	const tr = $derived(translator(lang));
	const row = $derived(trips.pickedRow);
	const cc = $derived(trips.picked ?? '');
	const wordOf = (id: string, level: string | null) => {
		const m = trips.read.find((x) => x.id === id);
		const item = m && level ? legend(lang, m).find((l) => l.level === level) : null;
		return item
			? { text: item.text, language: item.language }
			: { text: t(lang, 'level.none'), language: lang };
	};
</script>

<aside class="travelCard" aria-labelledby="travel-card-title" data-testid="travel-card">
	<header>
		<div>
			<p class="kind">{tr('frame.family.travel')}</p>
			<h2 id="travel-card-title">{countryName(lang, cc)}</h2>
		</div>
		<button type="button" class="close" aria-label={tr('travelFamily.close')} onclick={onclose}>×</button>
	</header>
	<div class="body">
		{#if row}
			<ul class="marks">
				{#each trips.read as m (m.id)}
					{@const level = row.marks[m.id] ?? null}
					{@const w = wordOf(m.id, level)}
					<li>
						<span class="who">{countryName(lang, m.country)}</span>
						<span class="what"
							><span class="dot sev-{level ?? 'NONE'}" aria-hidden="true"></span><span lang={w.language}
								>{w.text}</span
							></span
						>
					</li>
				{/each}
			</ul>
			<p class="small">
				{row.disagree ? travel(lang, 'disagree', { gap: row.gap ?? '–' }) : travel(lang, 'agree')}
			</p>
		{:else}
			<p class="muted">{tr('travelFamily.none')}</p>
		{/if}
		<p><a href="/travel/{cc.toLowerCase()}">{tr('travelFamily.open')}</a></p>
	</div>
</aside>

<style>
	.travelCard {
		position: absolute;
		z-index: 7;
		top: 10px;
		right: 52px;
		width: min(400px, calc(100% - 120px));
		max-height: calc(100% - 20px);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px 8px 14px;
		border-bottom: 1px solid var(--line);
	}
	.kind {
		margin: 0;
		color: var(--muted);
		font: 600 12px/1.3 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	h2 {
		margin: 2px 0 0;
		font: 700 22px/1.1 var(--font-display);
	}
	.close {
		flex: none;
		width: 36px;
		height: 36px;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--surface);
		color: inherit;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.body {
		padding: 10px 14px 14px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.marks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.marks li {
		display: grid;
		grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
		gap: 10px;
		align-items: baseline;
	}
	.who {
		font-weight: 600;
	}
	.what {
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c, var(--line));
	}
	@media (max-width: 899px) {
		.travelCard {
			position: fixed;
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			width: auto;
			max-height: 62dvh;
			z-index: 30;
			border-radius: 16px 16px 0 0;
		}
	}
</style>
