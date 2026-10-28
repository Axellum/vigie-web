<script lang="ts">
	// The search of a place by name: the server keeps the GeoNames places; the browser asks after 250 ms
	// without typing. Enter takes the first answer. While a new answer is on its way, the last one stays.
	import { number } from '#lib/format.js';
	import { countryName, translator, type Lang } from '#lib/i18n.js';
	import type { Place } from '#lib/near.js';
	import type { PlaceMatch } from '#lib/places.js';

	let {
		lang,
		id = 'place-search',
		onpick
	}: { lang: Lang; id?: string; onpick: (place: Place, label: string) => void } = $props();
	const tr = $derived(translator(lang));

	let query = $state('');
	let found = $state<PlaceMatch[]>([]);
	let search = $state<'idle' | 'busy' | 'ok' | 'none' | 'failed'>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = 0;

	function onQuery() {
		clearTimeout(timer);
		const q = query.trim();
		if (q.length < 2) {
			found = [];
			search = 'idle';
			return;
		}
		search = 'busy';
		timer = setTimeout(() => void runSearch(q), 250);
	}

	async function runSearch(q: string) {
		const ticket = ++asked;
		search = 'busy';
		try {
			const response = await fetch(`/data/places.json?q=${encodeURIComponent(q)}`);
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as { places: PlaceMatch[] };
			if (ticket !== asked) return;
			found = body.places;
			search = found.length ? 'ok' : 'none';
		} catch {
			if (ticket === asked) {
				found = [];
				search = 'failed';
			}
		}
	}

	const placeLabel = (p: PlaceMatch) =>
		[p.name, p.region, countryName(lang, p.cc)].filter(Boolean).join(', ');
	const placeDetail = (p: PlaceMatch) =>
		[
			[p.region, countryName(lang, p.cc)].filter(Boolean).join(', '),
			p.population ? tr('near.inhabitants', { n: number(lang, p.population, 0) }) : null
		]
			.filter(Boolean)
			.join(' · ');

	function pick(p: PlaceMatch) {
		onpick({ lat: p.lat, lon: p.lon }, placeLabel(p));
		query = '';
		found = [];
		search = 'idle';
	}
</script>

<form
	class="search"
	role="search"
	onsubmit={(e) => {
		e.preventDefault();
		if (found[0]) pick(found[0]);
	}}
>
	<label for={id}>{tr('near.search')}</label>
	<input
		{id}
		type="search"
		autocomplete="off"
		spellcheck="false"
		placeholder={tr('near.searchPlaceholder')}
		bind:value={query}
		oninput={onQuery}
	/>
	{#if found.length && (search === 'ok' || search === 'busy')}
		<ul class="results">
			{#each found as p (`${p.name}|${p.region}|${p.cc}|${p.lat}`)}
				<li>
					<button type="button" onclick={() => pick(p)}>
						<strong>{p.name}</strong>
						<span class="muted">{placeDetail(p)}</span>
					</button>
				</li>
			{/each}
		</ul>
		<p class="credit">{tr('near.placesCredit')}</p>
	{:else if search === 'busy'}
		<p class="muted small" role="status">{tr('near.searching')}</p>
	{:else if search === 'none'}
		<p class="muted small">{tr('near.searchNone')}</p>
	{:else if search === 'failed'}
		<p class="note">{tr('near.searchFailed')}</p>
	{/if}
</form>

<style>
	.search {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 560px;
	}
	.search label {
		font-weight: 600;
		font-size: 14px;
	}
	.search input {
		font: inherit;
		padding: 9px 11px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		min-width: 0;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.results li + li {
		border-top: 1px solid var(--line);
	}
	.results button {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		width: 100%;
		text-align: left;
		padding: 8px 11px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.results button:hover,
	.results button:focus-visible {
		background: var(--accent-soft);
	}
</style>
