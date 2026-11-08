<script lang="ts">
	// The page of an account: its blocks in order, each one card of one place, with a row of the places to look at one
	// only, and a mode to compose it (add, take away, move, size). One state per place (`placeState.svelte.ts`) serves
	// every block that shows it, so that a place's warnings, weather and tide are asked for once however many cards it
	// has on the page.
	//
	// The states are made when the component is, from the places it was given then: the page holding it wraps it in
	// `{#key}` on the list of places, so that a place added or removed makes a new view. While composing, the changes
	// are made on a copy of the blocks (`draft`); "Done" sends it, "Cancel" drops it.
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Credits from '#lib/components/Credits.svelte';
	import LevelPill from '#lib/components/LevelPill.svelte';
	import PlaceCard from '#lib/components/PlaceCard.svelte';
	import { translator, type Key, type Lang } from '#lib/i18n.js';
	import { BLOCK_SIZES, MAX_BLOCKS, type Block, type BlockSize } from '#lib/pageConfig.js';
	import { addBlock, moveBlock, removeBlock, resizeBlock, sameBlocks } from '#lib/pageEdit.js';
	import { PlaceState } from '#lib/placeState.svelte.js';
	import { DEFAULT_UNITS, type Units } from '#lib/units.js';
	import { CARDS, type Card, type Profile } from '#lib/profiles.js';
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
		pageId,
		title,
		hazards,
		hazardsAttribution,
		served,
		uncovered,
		now,
		selected,
		units = DEFAULT_UNITS
	}: {
		lang: Lang;
		places: MyPlace[];
		blocks: Block[];
		pageId: string;
		title: string;
		hazards: Hazard[];
		hazardsAttribution: string | null;
		served: string[];
		uncovered: UncoveredCountry[];
		now: number;
		/** The place looked at alone when the page was asked for, known to the server so that it draws the same. */
		selected: string | null;
		/** The units of the figures; the default ones when the person chose none. */
		units?: Units;
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
						units,
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
	let only = $state<string | null>(untrack(() => (places.some((p) => p.id === selected) ? selected : null)));
	function choose(id: string | null) {
		only = id;
		const url = new URL(page.url.href);
		if (id) url.searchParams.set('place', id);
		else url.searchParams.delete('place');
		replaceState(url, page.state);
	}

	// --- composing -----------------------------------------------------------------------------------------
	const CARD_KEY: Record<Card, Key> = {
		official: 'me.cardOfficial',
		hazards: 'me.cardHazards',
		weather: 'me.cardWeather',
		sea: 'me.cardSea',
		tide: 'me.cardTide',
		surf: 'me.cardSurf',
		sky: 'me.cardSky',
		air: 'me.cardAir'
	};
	const SIZE_KEY: Record<BlockSize, Key> = { s: 'me.sizeS', m: 'me.sizeM', l: 'me.sizeL' };
	const label = (b: { type: Card; place: string }) =>
		`${tr(CARD_KEY[b.type])} · ${byId.get(b.place)?.name ?? ''}`;

	let editing = $state(false);
	let draft = $state<Block[]>([]);
	let draftTitle = $state('');
	let saving = $state(false);
	let problem = $state<Key | null>(null);
	/** What the last gesture did, said to a screen reader (a moved block keeps the focus, so nothing else says it). */
	let status = $state('');
	let dialog = $state<HTMLDialogElement>();
	let pick = $state<{ type: Card; place: string; size: BlockSize }>({
		type: 'weather',
		place: untrack(() => places[0]?.id ?? ''),
		size: 'm'
	});
	const dirty = $derived(editing && (!sameBlocks(draft, blocks) || draftTitle.trim() !== title));
	const list = $derived(editing ? draft : blocks);

	function startEditing() {
		if (only !== null) choose(null);
		draft = [...blocks];
		draftTitle = title;
		problem = null;
		status = '';
		editing = true;
	}
	function move(b: Block, step: -1 | 1) {
		draft = moveBlock(draft, b.id, step);
		status = tr('me.moved', {
			block: label(b),
			n: draft.findIndex((x) => x.id === b.id) + 1,
			total: draft.length
		});
		// The button that was used keeps the focus, unless the block reached an end and it is now disabled.
		void tick().then(() => {
			const wanted = document.getElementById(`b-${b.id}-${step === -1 ? 'up' : 'down'}`);
			const other = document.getElementById(`b-${b.id}-${step === -1 ? 'down' : 'up'}`);
			((wanted as HTMLButtonElement | null)?.disabled ? other : wanted)?.focus();
		});
	}
	function remove(b: Block) {
		const at = draft.findIndex((x) => x.id === b.id);
		draft = removeBlock(draft, b.id);
		status = tr('me.removed', { block: label(b) });
		void tick().then(() => {
			const next = draft[Math.min(at, draft.length - 1)];
			(document.getElementById(next ? `b-${next.id}-remove` : 'add-block') as HTMLElement | null)?.focus();
		});
	}
	function resize(b: Block, size: BlockSize) {
		draft = resizeBlock(draft, b.id, size);
		status = tr('me.resized', { block: label(b), size: tr(SIZE_KEY[size]).toLowerCase() });
	}
	function openAdd() {
		if (!byId.has(pick.place)) pick.place = places[0].id;
		dialog?.showModal();
	}
	function confirmAdd() {
		const next = addBlock(draft, pick);
		if (next) {
			draft = next;
			status = tr('me.added', { block: label(pick) });
		} else status = tr('me.full', { max: MAX_BLOCKS });
		dialog?.close();
	}

	// Outside composing a card only appears where the place has it: the tide where the model has a point, the surf spots
	// for the sea profiles. The same rule as "near me". While composing, every block is there so that it can be taken away.
	const available = (b: Block) => states[b.place]?.order.includes(b.type) ?? false;
	const shown = $derived(
		list.filter(
			(b) => byId.has(b.place) && (editing || ((only === null || b.place === only) && available(b)))
		)
	);
	const credits = $derived([
		...new Set(
			(only ? [only] : [...new Set(list.map((b) => b.place))]).flatMap((id) => states[id]?.credits ?? [])
		)
	]);
	const said = $derived(!editing && only ? (states[only]?.sentence ?? []) : []);
</script>

<svelte:window onbeforeunload={(e) => dirty && e.preventDefault()} />

<p class="visually-hidden" role="status" aria-live="polite">{status}</p>

{#if places.length === 0}
	<div class="card stack empty">
		<p>{tr('me.noPlace')}</p>
		<p class="btn-row">
			<a class="btn" href="/me/places">{tr('places.add')}</a>
			<a class="btn quiet" href="/near">{tr('me.nearLink')}</a>
			<a class="btn" href="/account#zones">{tr('me.zonesLink')}</a>
		</p>
	</div>
{:else}
	{#if editing}
		<form
			class="card stack compose"
			method="POST"
			action="?/save"
			use:enhance={({ cancel }) => {
				if (!dirty) {
					editing = false;
					cancel();
					return;
				}
				saving = true;
				problem = null;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') {
						await update({ reset: false });
						editing = false;
					} else {
						problem =
							result.type === 'failure' && result.data?.error === 'title'
								? 'me.titleMissing'
								: 'me.saveFailed';
					}
				};
			}}
		>
			<input type="hidden" name="page" value={pageId} />
			<input type="hidden" name="blocks" value={JSON.stringify(draft)} />
			<label class="field">
				<span>{tr('me.pageTitle')}</span>
				<input name="title" maxlength="60" required bind:value={draftTitle} />
			</label>
			<div class="btn-row">
				<button type="submit" class="btn" disabled={saving}>{tr('me.done')}</button>
				<button type="button" class="btn quiet" onclick={() => (editing = false)} disabled={saving}
					>{tr('me.cancel')}</button
				>
				<button type="button" class="btn quiet" id="add-block" onclick={openAdd}>+ {tr('me.add')}</button>
			</div>
			{#if dirty}<p class="muted small">{tr('me.unsaved')}</p>{/if}
			{#if problem}<p class="note" role="alert">{tr(problem)}</p>{/if}
		</form>
	{:else}
		<div class="bar">
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
			<div class="btn-row">
				<a class="btn quiet" href="/me/places">{tr('me.manage')}</a>
				<button type="button" class="btn quiet" onclick={startEditing}>{tr('me.edit')}</button>
			</div>
		</div>

		{#if said.length}
			<div class="said">
				<p class="sentence">{said.join(' ')}</p>
				<p class="muted small">{tr('sentence.note')}</p>
			</div>
		{/if}
	{/if}

	{#if shown.length}
		<div class="blocks">
			{#each shown as b, i (b.id)}
				<div class="block size-{b.size}" class:editing>
					{#if editing}
						<div class="tools" role="group" aria-label={label(b)}>
							<span class="name">{label(b)}</span>
							<span class="sizes" role="group" aria-label={tr('me.size')}>
								{#each BLOCK_SIZES as s (s)}
									<button
										type="button"
										class="chip"
										aria-pressed={b.size === s}
										aria-label={tr(SIZE_KEY[s])}
										onclick={() => resize(b, s)}>{s.toUpperCase()}</button
									>
								{/each}
							</span>
							<button
								type="button"
								class="tool"
								id="b-{b.id}-up"
								disabled={i === 0}
								aria-label="{tr('me.up')} : {label(b)}"
								onclick={() => move(b, -1)}>↑</button
							>
							<button
								type="button"
								class="tool"
								id="b-{b.id}-down"
								disabled={i === shown.length - 1}
								aria-label="{tr('me.down')} : {label(b)}"
								onclick={() => move(b, 1)}>↓</button
							>
							<button
								type="button"
								class="tool"
								id="b-{b.id}-remove"
								aria-label="{tr('me.remove')} : {label(b)}"
								onclick={() => remove(b)}>✕</button
							>
						</div>
					{/if}
					{#if available(b)}
						<PlaceCard
							state={states[b.place]}
							name={b.type}
							size={b.size}
							placeName={only && !editing ? undefined : byId.get(b.place)?.name}
						/>
					{:else}
						<p class="card muted small">{tr('me.unavailable')}</p>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="muted">{tr('me.noCard')}</p>
	{/if}
	<Credits {lang} {credits} />

	<dialog bind:this={dialog} aria-labelledby="add-title">
		<h2 id="add-title">{tr('me.add')}</h2>
		<fieldset>
			<legend>{tr('me.what')}</legend>
			{#each CARDS as c (c)}
				<label class="option"
					><input type="radio" name="what" value={c} bind:group={pick.type} /><span>{tr(CARD_KEY[c])}</span
					></label
				>
			{/each}
		</fieldset>
		<fieldset>
			<legend>{tr('me.where')}</legend>
			{#each places as p (p.id)}
				<label class="option"
					><input type="radio" name="where" value={p.id} bind:group={pick.place} /><span>{p.name}</span
					></label
				>
			{/each}
		</fieldset>
		<fieldset>
			<legend>{tr('me.size')}</legend>
			{#each BLOCK_SIZES as s (s)}
				<label class="option"
					><input type="radio" name="size" value={s} bind:group={pick.size} /><span>{tr(SIZE_KEY[s])}</span
					></label
				>
			{/each}
			<p class="muted small">{tr('me.sizeHelp')}</p>
		</fieldset>
		<div class="btn-row">
			<button type="button" class="btn" onclick={confirmAdd}>{tr('me.addConfirm')}</button>
			<button type="button" class="btn quiet" onclick={() => dialog?.close()}>{tr('me.cancel')}</button>
		</div>
	</dialog>
{/if}

<style>
	.empty .btn-row {
		margin: 0;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
	}
	.compose .field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 420px;
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
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tools .name {
		flex: 1 1 100%;
		font-size: 13px;
		font-weight: 600;
	}
	.sizes {
		display: inline-flex;
		gap: 4px;
		margin-right: auto;
	}
	/* Big enough to touch: 44 px square. */
	.tool,
	.sizes .chip {
		min-width: 44px;
		min-height: 44px;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		font-size: 16px;
		cursor: pointer;
	}
	.tool:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.sizes .chip[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	dialog {
		max-width: min(440px, calc(100vw - 32px));
		width: 100%;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		padding: 18px;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.5);
	}
	dialog h2 {
		margin: 0 0 8px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 12px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	legend {
		font-weight: 600;
		margin-bottom: 6px;
		padding: 0;
	}
	.option {
		position: relative;
	}
	.option input {
		position: absolute;
		opacity: 0;
		inset: 0;
		cursor: pointer;
	}
	.option span {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}
	.option input:checked + span {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	.option input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
