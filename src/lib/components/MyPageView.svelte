<script lang="ts">
	// The page of an account, as it is read: its blocks in order, each one card of one place, with a row of the places
	// to look at one only. One state per place (`placeState.svelte.ts`) serves every block that shows it, so that a
	// place's warnings, weather and tide are asked for once however many cards it has on the page.
	//
	// The states are made when the component is, from the places it was given then: the page holding it wraps it in
	// `{#key}` on the list of places, so that a place added or removed makes a new view.
	import { untrack } from 'svelte';
	import Credits from '#lib/components/Credits.svelte';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import PlaceCard from '#lib/components/PlaceCard.svelte';
	import { translator, type Lang } from '#lib/i18n.js';
	import type { Block } from '#lib/pageConfig.js';
	import { PlaceState } from '#lib/placeState.svelte.js';
	import type { Profile } from '#lib/profiles.js';
	import type { Hazard, UncoveredCountry } from '#lib/types.js';

	export interface MyPlace {
		id: string;
		name: string;
		lat: number;
		lon: number;
		radiusKm: number;
		profile: Profile | null;
	}

	let {
		lang,
		places,
		blocks,
		hazards,
		hazardsAttribution,
		served,
		uncovered,
		now
	}: {
		lang: Lang;
		places: MyPlace[];
		blocks: Block[];
		hazards: Hazard[];
		hazardsAttribution: string | null;
		served: string[];
		uncovered: UncoveredCountry[];
		now: number;
	} = $props();
	const tr = $derived(translator(lang));

	const states: Record<string, PlaceState> = untrack(() =>
		Object.fromEntries(
			places.map((p) => [
				p.id,
				new PlaceState(() => {
					const current = places.find((x) => x.id === p.id) ?? p;
					return {
						place: { lat: current.lat, lon: current.lon },
						radiusKm: current.radiusKm,
						profile: current.profile,
						lang,
						now,
						hazards,
						hazardsAttribution,
						served,
						uncovered
					};
				})
			])
		)
	);
	const byId = $derived(new Map(places.map((p) => [p.id, p])));

	/** The place looked at alone, or null for all of them; kept in the address so that it can be shared with oneself. */
	let only = $state<string | null>(
		untrack(() => {
			const wanted =
				typeof location === 'undefined' ? null : new URL(location.href).searchParams.get('place');
			return places.some((p) => p.id === wanted) ? wanted : null;
		})
	);
	function choose(id: string | null) {
		only = id;
		const url = new URL(location.href);
		if (id) url.searchParams.set('place', id);
		else url.searchParams.delete('place');
		history.replaceState(history.state, '', url);
	}

	// A card only appears where the place has it: the tide where the model has a point, the surf spots for the sea
	// profiles. The same rule as "near me".
	const shown = $derived(
		blocks.filter(
			(b) =>
				byId.has(b.place) && (only === null || b.place === only) && states[b.place]?.order.includes(b.type)
		)
	);
	const credits = $derived([
		...new Set(
			(only ? [only] : [...new Set(blocks.map((b) => b.place))]).flatMap((id) => states[id]?.credits ?? [])
		)
	]);
	const said = $derived(only ? (states[only]?.sentence ?? []) : []);
</script>

{#if places.length === 0}
	<div class="card stack empty">
		<p>{tr('me.noPlace')}</p>
		<p class="btn-row">
			<a class="btn" href="/near">{tr('me.nearLink')}</a>
			<a class="btn" href="/account#zones">{tr('me.zonesLink')}</a>
		</p>
	</div>
{:else}
	<nav class="chips" aria-label={tr('me.places')}>
		<button type="button" class="chip" aria-pressed={only === null} onclick={() => choose(null)}
			>{tr('me.all')}</button
		>
		{#each places as p (p.id)}
			{@const level = states[p.id]?.here[0]?.warning.level}
			<button type="button" class="chip" aria-pressed={only === p.id} onclick={() => choose(p.id)}>
				{p.name}
				{#if level}<LevelPill {lang} {level} />{/if}
			</button>
		{/each}
	</nav>

	{#if said.length}
		<div class="said">
			<p class="sentence">{said.join(' ')}</p>
			<p class="muted small">{tr('sentence.note')}</p>
		</div>
	{/if}

	{#if shown.length}
		<div class="blocks">
			{#each shown as b (b.id)}
				<div class="block size-{b.size}">
					<PlaceCard
						state={states[b.place]}
						name={b.type}
						size={b.size}
						placeName={only ? undefined : byId.get(b.place)?.name}
					/>
				</div>
			{/each}
		</div>
	{:else}
		<p class="muted">{tr('me.noCard')}</p>
	{/if}
	<Credits {lang} {credits} />
{/if}

<style>
	.empty .btn-row {
		margin: 0;
	}
	.said {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sentence {
		font-family: var(--font-display);
		font-size: 20px;
		line-height: 1.3;
		margin: 0;
	}
	/* A grid of twelve columns on a wide screen (small is a third, medium a half, large the whole row); one column
	   on a phone, where the size only sets how much detail a card shows. */
	.blocks {
		display: grid;
		gap: 12px;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}
	.block {
		min-width: 0;
	}
	@media (min-width: 900px) {
		.blocks {
			grid-template-columns: repeat(12, minmax(0, 1fr));
		}
		.size-s {
			grid-column: span 4;
		}
		.size-m {
			grid-column: span 6;
		}
		.size-l {
			grid-column: span 12;
		}
	}
</style>
