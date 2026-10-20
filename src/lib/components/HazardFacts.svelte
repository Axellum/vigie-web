<script lang="ts">
	import { number } from '$lib/format';
	import { tOr, translator, type Lang } from '$lib/i18n';
	import type { Hazard } from '$lib/types';
	import Time from './Time.svelte';

	let { lang, hazard }: { lang: Lang; hazard: Hazard } = $props();
	const tr = $derived(translator(lang));
	const quake = $derived(hazard.category === 'EARTHQUAKE');
	const gdacs = $derived(hazard.sources.includes('GDACS'));
</script>

<dl class="facts">
	{#if hazard.value != null}
		<dt>{tr(quake ? 'detail.magnitude' : 'detail.value')}</dt>
		<dd class="data">{quake ? 'M ' : ''}{number(lang, hazard.value)} {hazard.unit ?? ''}</dd>
	{/if}
	{#if hazard.depthKm != null}
		<dt>{tr('detail.depth')}</dt>
		<dd class="data">{number(lang, hazard.depthKm)} km</dd>
	{/if}
	<dt>{tr('detail.time')}</dt>
	<dd><Time {lang} unix={hazard.time} /></dd>
	<dt>{tr('detail.position')}</dt>
	<dd class="data">{hazard.lat.toFixed(2)}°, {hazard.lon.toFixed(2)}°</dd>
	{#if hazard.tsunami}
		<dt>{tr('detail.tsunami')}</dt>
		<dd>{tr('detail.tsunamiYes')}</dd>
	{/if}
	<dt>{tr('detail.severity')}</dt>
	<dd>{tr(quake ? 'detail.severityQuake' : gdacs ? 'detail.severityGdacs' : 'detail.severityOther')}</dd>
	{#if hazard.nearPlaces}
		<dt>{tr('detail.near')}</dt>
		<dd>
			{#if hazard.nearPlaces.length}
				<ul class="near">
					{#each hazard.nearPlaces as place, i (i)}
						<li>
							{place.name}
							<span class="muted"
								>({tOr(lang, `near.kind.${place.kind}`, place.kind)}{#if place.distanceKm != null}, <span
										class="data">{number(lang, place.distanceKm)} km</span
									>{/if})</span
							>
						</li>
					{/each}
				</ul>
			{:else}
				{tr('detail.nearNone')}
			{/if}
			<span class="muted small">· {tr('detail.nearDerived')}</span>
		</dd>
	{/if}
	<dt>{tr('detail.sources')}</dt>
	<dd>{hazard.sources.join(', ')} · {tOr(lang, `cat1.${hazard.category}`, hazard.category)}</dd>
</dl>
{#if gdacs}
	<p class="credit">{tr('detail.gdacs')}</p>
{/if}
{#if hazard.attribution}
	<p class="credit">{hazard.attribution}</p>
{/if}

<style>
	.near {
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
