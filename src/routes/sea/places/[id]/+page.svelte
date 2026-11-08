<script lang="ts">
	// One place of the coast: what it is, said with what the catalogue does not know; whether to go today according to the surf
	// spots around it (the verdicts are those of the spots, not of the place, and the page says how far the nearest is); the tide
	// where the model has one; the other places near it. A catalogue, not a forecast: no place here is judged, and nothing is
	// for safety.
	import { onMount } from 'svelte';
	import { ACTIVITY_IDS, activityText, type ActivityId, type Verdict } from '#lib/activities.js';
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import TideSection from '#lib/components/TideSection.svelte';
	import { number } from '#lib/format.js';
	import { translator } from '#lib/i18n.js';
	import { placeHash } from '#lib/near.js';
	import { answerText } from '#lib/sea/answer.js';
	import { DEFAULT_CHOICE, readChoice, updateChoice, type SeaChoice } from '#lib/sea/choice.js';
	import { answerOf, rankSpots, SLUGS } from '#lib/sea/overview.js';
	import { NEARBY_KM, osmLink, PLACE_KM, spotsAround } from '#lib/sea/places.js';
	import { dateLabel, placesText, placeTitle, placeWhere } from '#lib/sea/places-text.js';
	import SeaPlaceRow from '#lib/sea/SeaPlaceRow.svelte';
	import { seaText } from '#lib/sea/text.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const t = (key: string, vars: Record<string, string | number> = {}) => placesText(lang, key, vars);
	const place = $derived(data.place);
	const title = $derived(placeTitle(lang, place));
	const where = $derived(placeWhere(place));
	const at = $derived({ lat: place.lat, lon: place.lon });

	// The activity this browser chose on the sea pages, kept there only: read once the page is shown.
	let choice = $state<SeaChoice>(DEFAULT_CHOICE);
	onMount(() => {
		choice = readChoice();
	});
	const active = $derived<ActivityId>(choice.activity ?? 'surf');
	const pick = (id: ActivityId) => {
		choice = updateChoice({ activity: id });
	};

	const overview = $derived(data.overview);
	const rowsOf = (id: ActivityId) => (overview ? rankSpots(overview.spots, id, at) : []);
	const around = $derived(spotsAround(rowsOf(active)));
	const best = $derived(around.within[0] ?? null);
	const sentence = $derived(
		around.within.length ? answerText(lang, answerOf(around.within, at), true) : null
	);
	const bestOf = (id: ActivityId): Verdict | null =>
		spotsAround(rowsOf(id)).within[0]?.activity.verdict ?? null;
	const glyph = (v: Verdict | null) =>
		v === 'good' ? '✓' : v === 'possible' ? '~' : v === 'poor' ? '✕' : '';
	const word = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');
	const activityName = $derived(activityText(lang, `activity.${active}`));

	const uses = $derived(place.uses?.length ? place.uses.map((u) => t(`use.${u}`)).join(', ') : null);
	const description = $derived(t(`metaPlace.${place.type}`, { title }));
</script>

<!-- A place without a name of its own ("slipway near Saint-Malo") is worth a visit, not a search result. -->
<Seo title={`${title} · ${t('page')}`} {description} noindex={place.name == null} />

<div class="page">
	<header class="intro">
		<p class="small"><a href="/sea/places">← {t('back')}</a></p>
		<p class="kind small">{t(`type.${place.type}`)}</p>
		<h1>{title}</h1>
		{#if where}<p class="muted">{where}</p>{/if}
		<p class="note">{t('safety')}</p>
	</header>

	<section class="card answer" aria-labelledby="answer-title">
		<h2 id="answer-title">{t('answerTitle')}</h2>
		<p class="muted small">{t('answerHonest')}</p>
		{#if overview}
			<div class="picks" role="group" aria-label={seaText(lang, 'myActivity')}>
				{#each ACTIVITY_IDS as id (id)}
					{@const best = bestOf(id)}
					<button type="button" aria-pressed={id === active} onclick={() => pick(id)}>
						{activityText(lang, `activity.${id}`)}{#if best}
							<span class="hint v-{best}" aria-hidden="true">{glyph(best)}</span><span
								class="visually-hidden"
							>
								({word(best).toLowerCase()})</span
							>{/if}
					</button>
				{/each}
			</div>
			<div aria-live="polite">
				{#if sentence}
					<p class="sentence">{sentence}</p>
					{#if best}
						<p class="small">
							<a href="/surf/{best.spot.id}">{t('answerSpotOpen', { name: best.spot.name })}</a>
						</p>
					{/if}
				{:else}
					<p class="sentence">{t('answerNone', { radius: PLACE_KM })}</p>
				{/if}
				{#if around.nearest && around.nearest.spot.id !== best?.spot.id}
					<p class="small">
						{t('answerSpot', {
							name: around.nearest.spot.name,
							km: number(lang, around.nearest.km, (around.nearest.km ?? 0) < 10 ? 1 : 0)
						})}
						<a href="/surf/{around.nearest.spot.id}"
							>{t('answerSpotOpen', { name: around.nearest.spot.name })}</a
						>
					</p>
				{/if}
				<p class="small"><a href="/sea/{SLUGS[active]}">{t('allSpots')} ({activityName.toLowerCase()})</a></p>
				{#if overview.stale}<p class="note small">{seaText(lang, 'stale')}</p>{/if}
			</div>
		{:else}
			<p class="note">{seaText(lang, 'unavailable')} {seaText(lang, 'unavailableHint')}</p>
		{/if}
	</section>

	<section class="card" aria-labelledby="what-title">
		<h2 id="what-title">{t('whatIs')}</h2>
		<p>{t(`about.${place.type}`)}</p>
		{#if uses}<p>{t('uses', { list: uses })}</p>{/if}
		{#if place.type === 'bathing' && place.quality}
			<p>
				<b>{t('quality')} :</b>
				{t(`quality.${place.quality}`)}
			</p>
			<p class="muted small">{t('qualityNote')}</p>
		{/if}
		<dl class="facts">
			<dt>{t('position')}</dt>
			<dd>
				<span class="data">{place.lat.toFixed(4)}, {place.lon.toFixed(4)}</span>
				· <a href={osmLink(place)} rel="noopener noreferrer">{t('openMap')}</a>
			</dd>
		</dl>
		<p class="muted small">{t('positionNote')}</p>
		{#if data.accounts}
			<p class="small">
				<a href="/me/places{placeHash(at, 25, null)}" rel="nofollow">{tr('me.addHere')}</a>
			</p>
		{/if}
	</section>

	<TideSection {lang} at={{ lat: Math.round(place.lat * 20) / 20, lon: Math.round(place.lon * 20) / 20 }} />

	<section class="block" aria-labelledby="nearby-title">
		<h2 id="nearby-title">{t('nearbyTitle')}</h2>
		{#if data.nearbyFailed && !data.groups.length}
			<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
		{:else if !data.groups.length}
			<p class="muted">{t('nearbyNone', { radius: NEARBY_KM.common })}</p>
		{:else}
			{#each data.groups as group (group.type)}
				<h3>{t(`types.${group.type}`)}</h3>
				<ul class="places">
					{#each group.places as other (other.id)}<li>
							<SeaPlaceRow {lang} place={other} showKind={false} />
						</li>{/each}
				</ul>
				{#if group.more}<p class="muted small">{t('nearbyMore', { count: group.more })}</p>{/if}
			{/each}
			{#if data.nearbyFailed}<p class="note small">{t('unavailable')}</p>{/if}
		{/if}
	</section>

	<footer class="foot">
		{#if data.built}<p class="muted small">{t('updated', { date: dateLabel(lang, data.built) })}</p>{/if}
		{#if data.note}<p class="muted small" lang="en">{data.note}</p>{/if}
		{#if data.licence}<p class="muted small" lang="en">{t('licenceTitle')}: {data.licence}</p>{/if}
		<Credits {lang} credits={[data.attribution, ...data.nearbyAttribution]} />
	</footer>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.intro h1 {
		margin: 0 0 4px;
	}
	.kind {
		margin: 0;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.card h2,
	.block h2 {
		margin: 0 0 6px;
	}
	.block h3 {
		margin: 12px 0 4px;
		font-size: 15px;
	}
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 8px 0;
	}
	.picks button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: var(--surface);
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.picks button:hover {
		border-color: var(--accent);
	}
	.picks button[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--surface);
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
	.sentence {
		margin: 8px 0 4px;
		font-size: 18px;
		font-weight: 600;
		line-height: 1.35;
	}
	.answer p {
		margin: 4px 0;
	}
	.places {
		list-style: none;
		margin: 6px 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 8px;
	}
	.foot {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.foot p {
		margin: 0;
	}
</style>
