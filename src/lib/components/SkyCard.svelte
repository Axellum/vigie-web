<script lang="ts">
	// The "Sky" card of a place: the aurora of the coming night in one sentence, then the facts behind it. The sentence
	// is the API's estimate (said to be one, with a link to its method); NOAA's own values are shown as NOAA gives them.
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { activityWords, auroraSentence, placeTime, sky, type Aurora } from '#lib/sky.js';

	// `bare`: inside a card of the page, which has the title and shows the credits. `link`: to the sky page.
	let {
		lang,
		aurora,
		bare = false,
		link = false
	}: { lang: Lang; aurora: Aurora; bare?: boolean; link?: boolean } = $props();
	const METHOD_URL = 'https://github.com/Axellum/vigie-api/blob/main/docs/decisions/0013-aurora-estimate.md';

	const place = $derived(aurora.place);
	const estimate = $derived(place?.estimate ?? null);
	const level = $derived(estimate?.level ?? null);
	const activity = $derived(activityWords(lang, aurora.kpMax24h));
	const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)} %`);
	const credits = $derived(
		[...new Set((aurora.attribution ?? '').split(' | ').map((part) => part.trim()))].filter(Boolean)
	);
</script>

<svelte:element
	this={bare ? 'div' : 'section'}
	class="sky"
	class:card={!bare}
	aria-labelledby={bare ? undefined : 'sky-title'}
>
	{#if !bare}<h3 id="sky-title">{sky(lang, 'title')} · {sky(lang, 'auroraTitle')}</h3>{/if}

	{#if place}
		<p class="sentence" data-level={level ?? 'none'}>
			<span class="dot" aria-hidden="true"></span>
			<strong>{auroraSentence(lang, place)}</strong>
		</p>
		<p class="badge">{sky(lang, 'estimate')}</p>
	{/if}

	{#if activity}
		<p>{activity} <span class="muted">{sky(lang, 'activityNext')}</span></p>
	{:else if aurora.unavailable.length}
		<p class="muted">{sky(lang, 'unavailable')}</p>
	{/if}

	{#if place?.ovation}
		{@const o = place.ovation}
		<p class="muted small">
			{sky(lang, 'ovationNow')}{lang === 'fr' ? ' :' : ':'}
			{o.strongest == null || o.strongestKm == null
				? sky(lang, 'ovationNone')
				: o.strongestKm <= 50
					? sky(lang, 'ovationHere', { v: o.strongest })
					: sky(lang, 'ovationNear', { v: o.strongest, km: number(lang, o.strongestKm, 0) })}
		</p>
	{/if}

	{#if estimate && estimate.hours.length}
		<details>
			<summary>{sky(lang, 'details')}</summary>
			<div class="scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">{sky(lang, 'hour')}</th>
							<th scope="col">{sky(lang, 'chance')}</th>
							<th scope="col">{sky(lang, 'clouds')}</th>
							<th scope="col">{sky(lang, 'moon')}</th>
							<th scope="col">{sky(lang, 'kp')}</th>
						</tr>
					</thead>
					<tbody>
						{#each estimate.hours as h (h.time)}
							<tr>
								<td class="data">{placeTime(lang, h.time, place?.utcOffsetS ?? null)}</td>
								<td class="data">{pct(h.chance ?? h.chanceClearSky)}</td>
								<td class="data"
									>{h.cloudCover == null ? sky(lang, 'unknown') : `${Math.round(h.cloudCover)} %`}</td
								>
								<td class="data">{h.moonAltitude > 0 ? `${Math.round(h.moonIlluminated * 100)} %` : '–'}</td>
								<td class="data">{number(lang, h.kp)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	{/if}

	{#if place}
		<p class="muted small">
			{sky(lang, 'estimateNote')} <a href={METHOD_URL} rel="noopener">{sky(lang, 'method')}</a>.
		</p>
	{/if}
	{#if link}<p class="small"><a href="/sky">{sky(lang, 'pageLink')}</a></p>{/if}
	{#if !bare}{#each credits as credit (credit)}<p class="credit">{credit}</p>{/each}{/if}
</svelte:element>

<style>
	.sky {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	h3 {
		margin: 0;
	}
	.sentence {
		display: flex;
		gap: 10px;
		align-items: baseline;
		font-size: 17px;
		margin: 0;
	}
	.dot {
		flex: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--sev-none);
		transform: translateY(1px);
	}
	[data-level='likely'] .dot {
		background: #2fbf63;
	}
	[data-level='possible'] .dot {
		background: #9bd43a;
	}
	[data-level='unlikely'] .dot {
		background: var(--sev-none);
		opacity: 0.6;
	}
	.badge {
		align-self: flex-start;
		margin: 0;
		font-size: 12px;
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--accent-soft);
	}
	p {
		margin: 0;
	}
	.scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	table {
		border-collapse: collapse;
		font-size: 14px;
		margin-top: 6px;
	}
	th,
	td {
		padding: 3px 10px 3px 0;
		text-align: left;
		white-space: nowrap;
	}
	.small {
		font-size: 13px;
	}
</style>
