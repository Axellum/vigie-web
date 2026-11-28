<script lang="ts">
	// The sea family in the side panel of the home map: "should you go?" around the place of "here" (or everywhere), the
	// activities as chips with their best verdict, the answer in one sentence, then the best spots of the activity; the pins and
	// the card of a spot are on the map. Everything comes from the family's state (`seaFamily.svelte.ts`), the same rules as the
	// sea page, which keeps the whole list, the settings of the kite and the places of the coast.
	import type { Snippet } from 'svelte';
	import { ACTIVITY_IDS, activityText, type Verdict } from '#lib/activities.js';
	import Credits from '#lib/components/Credits.svelte';
	import { translator, type Lang } from '#lib/i18n.js';
	import { buoysText } from '#lib/sea/buoys.js';
	import type { SeaFamily } from '#lib/sea/seaFamily.svelte.js';
	import SeaSpotRow from '#lib/sea/SeaSpotRow.svelte';
	import { apiSentence, seaText } from '#lib/sea/text.js';

	let {
		lang,
		sea,
		place,
		layers
	}: {
		lang: Lang;
		sea: SeaFamily;
		/** The name of the place of "here", or null without one. */
		place: string | null;
		/** The layers of the family shown with it (the tide). */
		layers?: Snippet;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const tr = $derived(translator(lang));
	const glyph = (v: Verdict | null) =>
		v === 'good' ? '✓' : v === 'possible' ? '~' : v === 'poor' ? '✕' : '';
	const word = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');
	const BEST = 6;
</script>

<section class="sea" aria-labelledby="sea-title">
	<p class="eyebrow">
		{tr('frame.family.sea')}{#if place}{` · ${t('place', { place })}`}{/if}
	</p>
	<h2 id="sea-title">{t('title')}</h2>
	<p class="muted small">{tr('sea.intro')}</p>

	<div class="chips" role="group" aria-label={t('myActivity')}>
		{#each ACTIVITY_IDS as id (id)}
			{@const best = sea.bestOf(id)}
			<button type="button" class="chip" aria-pressed={sea.active === id} onclick={() => sea.choose(id)}
				>{activityText(lang, `activity.${id}`)}{#if best}
					<span class="hint v-{best}" aria-hidden="true">{glyph(best)}</span><span class="visually-hidden">
						({word(best).toLowerCase()})</span
					>{/if}</button
			>
		{/each}
	</div>

	{#if sea.status === 'ok' && sea.overview}
		<p class="said" aria-live="polite">{sea.sentence}</p>
		{#if sea.overview.stale}<p class="note small">{t('stale')}</p>{/if}
		{#if layers}<div class="layers">{@render layers()}</div>{/if}
		{#if sea.near.length}
			<h3 class="eyebrow">{tr('sea.best')}</h3>
			<ul class="spots">
				{#each sea.near.slice(0, BEST) as row (row.spot.id)}<li><SeaSpotRow {lang} {row} /></li>{/each}
			</ul>
		{/if}
		<p class="links small">
			<a href="/sea">{tr('frame.seaPage')}</a>
			<a href="/sea/places">{t('placesPage')}</a>
			<a href="/sea/buoys">{buoysText(lang, 'seaPageLink')}</a>
		</p>
		{#if sea.overview.disclaimer}
			{@const said = apiSentence(lang, sea.overview.disclaimer)}
			<p class="note small" lang={said.lang}>{said.text}</p>
		{/if}
		<Credits {lang} credits={[sea.overview.attribution]} />
	{:else if sea.status === 'failed'}
		<p class="note">{t('unavailable')}</p>
		{#if layers}<div class="layers">{@render layers()}</div>{/if}
	{:else}
		<p class="muted">{tr('sea.loading')}</p>
		{#if layers}<div class="layers">{@render layers()}</div>{/if}
	{/if}
</section>

<style>
	.sea {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	h2 {
		font: 700 26px/1.05 var(--font-display);
	}
	h3 {
		margin: 6px 0 0;
	}
	.said {
		font-weight: 600;
		line-height: 1.35;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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
	.chip[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--surface);
	}
	.spots {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}
	.hint {
		display: inline-block;
		min-width: 1.4em;
		text-align: center;
		border-radius: 10px;
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}
	.v-good {
		background: var(--sev-green);
		color: var(--on-sev);
	}
	.v-possible {
		background: var(--sev-yellow);
		color: var(--on-yellow);
	}
	.v-poor {
		background: var(--sev-red);
		color: var(--on-sev);
	}
	.layers {
		border-top: 1px solid var(--line);
		padding-top: 6px;
	}
</style>
