<script lang="ts">
	// The sky of a place, loaded on its own: the "Near me" page (or any page) gives the position already rounded to the
	// weather grid, and this card asks the site for the aurora of that cell once. `bare` draws it inside a card of the
	// page (no frame, no title, no credit): the page then shows the credit it receives through `onattribution`.
	import { untrack } from 'svelte';
	import SkyCard from '#lib/components/SkyCard.svelte';
	import type { Lang } from '#lib/i18n.js';
	import type { Place } from '#lib/near.js';
	import { sky, type Aurora } from '#lib/sky.js';

	let {
		lang,
		cell,
		bare = false,
		link = false,
		onattribution
	}: {
		lang: Lang;
		cell: Place | null;
		bare?: boolean;
		link?: boolean;
		onattribution?: (attribution: string | null) => void;
	} = $props();

	let state = $state<{ key: string; status: 'loading' | 'ok' | 'error' | 'budget'; value?: Aurora } | null>(
		null
	);

	async function load(key: string, at: Place) {
		state = { key, status: 'loading' };
		try {
			const response = await fetch(`/data/aurora.json?lat=${at.lat}&lon=${at.lon}`);
			if (response.status === 503) {
				const body = await response.json().catch(() => ({}));
				if (body?.reason === 'budget') {
					if (state?.key === key) state = { key, status: 'budget' };
					return;
				}
			}
			if (!response.ok) throw new Error(String(response.status));
			// The site's route already gives the site's model (`auroraFromApi` ran on the server).
			const value = (await response.json()) as Aurora;
			if (state?.key === key) {
				state = { key, status: 'ok', value };
				onattribution?.(value.attribution ?? null);
			}
		} catch {
			if (state?.key === key) state = { key, status: 'error' };
		}
	}

	$effect(() => {
		const at = cell;
		if (!at) return;
		const key = `${at.lat},${at.lon}`;
		untrack(() => {
			if (state?.key !== key) void load(key, at);
		});
	});
</script>

{#if state?.status === 'ok' && state.value}
	<SkyCard {lang} aurora={state.value} {bare} {link} />
{:else if state?.status === 'error' || state?.status === 'budget'}
	<p class="muted">{sky(lang, 'unavailable')}</p>
{:else if bare && cell}
	<p class="muted">{sky(lang, 'loading')}</p>
{/if}
