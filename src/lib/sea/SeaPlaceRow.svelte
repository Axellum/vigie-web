<script lang="ts">
	// One place of the catalogue: its kind, its name (or its kind and the nearest locality), where it is, and how far when a
	// position is known. A bathing site says the class of its water over 2021 to 2024 in words, never in a colour: the class is a
	// context, not a green light, and a colour would read as one. Every figure is the API's; what it did not give is left out.
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import type { SeaPlace } from './places.js';
	import { placesText, placeTitle, placeWhere } from './places-text.js';

	let { lang, place, showKind = true }: { lang: Lang; place: SeaPlace; showKind?: boolean } = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => placesText(lang, key, vars);
	const where = $derived(placeWhere(place));
	const uses = $derived(place.uses?.length ? place.uses.map((u) => t(`use.${u}`)).join(', ') : null);
	const km = $derived(
		place.distanceKm != null
			? t('away', { km: number(lang, place.distanceKm, place.distanceKm < 10 ? 1 : 0) })
			: null
	);
</script>

<a class="row" href="/sea/places/{place.id}">
	<span class="body">
		{#if showKind}<span class="kind">{t(`type.${place.type}`)}</span>{/if}
		<strong>{placeTitle(lang, place)}</strong>
		{#if where}<span class="muted small">{where}</span>{/if}
		{#if place.type === 'bathing' && place.quality}
			<span class="small">{t('quality')} : <b>{t(`quality.${place.quality}`)}</b></span>
		{/if}
		{#if uses}<span class="muted small">{t('uses', { list: uses })}</span>{/if}
	</span>
	{#if km}<span class="km muted small">{km}</span>{/if}
</a>

<style>
	.row {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.row:hover {
		border-color: var(--accent);
	}
	.kind {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.km {
		flex: none;
		white-space: nowrap;
	}
</style>
