<script lang="ts">
	// The places of the coast: ports, slipways, anchorages, dive sites and bathing sites, by kind, by name or town, or around a
	// position. A catalogue, not a forecast: the page says so first, and no place here is given a verdict. The list is the
	// server's (it works without a script); "around my position" is the browser's, which asks the site for the places within a
	// few kilometres of a position rounded to a kilometre.
	import { onMount } from 'svelte';
	import Credits from '#lib/components/Credits.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { readFollowed } from '#lib/followed.js';
	import { number } from '#lib/format.js';
	import { PLACE_TYPES, type PlaceType, type SeaPlaceList } from '#lib/sea/places.js';
	import { placesText } from '#lib/sea/places-text.js';
	import SeaPlaceRow from '#lib/sea/SeaPlaceRow.svelte';
	import { seaText } from '#lib/sea/text.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const t = (key: string, vars: Record<string, string | number> = {}) => placesText(lang, key, vars);
	const list = $derived<SeaPlaceList | null>(data.list);

	// The position of this browser, taken on a click or from the place followed in "Near me"; never sent as it is.
	let me = $state<{ lat: number; lon: number; name: string | null } | null>(null);
	let locating = $state<'idle' | 'busy' | 'failed'>('idle');
	let nearby = $state<{ status: 'idle' | 'loading' | 'ok' | 'error'; list: SeaPlaceList | null }>({
		status: 'idle',
		list: null
	});

	onMount(() => {
		const first = readFollowed()[0];
		if (first) me = { lat: first.lat, lon: first.lon, name: first.name };
	});

	function locate() {
		if (!('geolocation' in navigator)) {
			locating = 'failed';
			return;
		}
		locating = 'busy';
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = 'idle';
				me = { lat: p.coords.latitude, lon: p.coords.longitude, name: null };
			},
			() => (locating = 'failed'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	// The places around the position, for the kind and the words of the address: asked again when any of them changes, and an
	// answer that comes after a newer question is dropped.
	let asking = 0;
	$effect(() => {
		const place = me;
		const type = data.type;
		const q = data.q;
		if (!place) {
			nearby = { status: 'idle', list: null };
			return;
		}
		const mine = ++asking;
		nearby = { status: 'loading', list: null };
		const round = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
		const query = new URLSearchParams({
			lat: round(place.lat),
			lon: round(place.lon),
			radius_km: '25',
			limit: '24'
		});
		if (type) query.set('type', type);
		if (q) query.set('q', q);
		void fetch(`/data/sea-places.json?${query}`)
			.then((r) => (r.ok ? (r.json() as Promise<SeaPlaceList>) : Promise.reject(new Error(String(r.status)))))
			.then((answer) => {
				if (mine === asking) nearby = { status: 'ok', list: answer };
			})
			.catch(() => {
				if (mine === asking) nearby = { status: 'error', list: null };
			});
	});

	const href = (change: { type?: PlaceType | null; page?: number }): string => {
		const params = new URLSearchParams();
		const type = 'type' in change ? change.type : data.type;
		if (type) params.set('type', type);
		if (data.q) params.set('q', data.q);
		if (change.page && change.page > 1) params.set('page', String(change.page));
		const text = params.toString();
		return `/sea/places${text ? `?${text}` : ''}`;
	};
	const countText = (n: number) =>
		n === 1 ? t('count.one') : t('count.many', { count: number(lang, n, 0) });
	const pages = $derived(list ? Math.max(1, Math.ceil(list.count / data.pageSize)) : 1);
	// The counts of each kind are the API's for what matches: with a kind chosen, the other kinds count none, so they are not shown.
	const counts = $derived(!data.type && list ? list.byType : null);
	const total = $derived(list?.count ?? 0);
</script>

<Seo title={t('page')} description={t('meta')} noindex={data.q !== '' || data.page > 1} />

<div class="page">
	<header class="intro">
		<p class="small"><a href="/sea">← {seaText(lang, 'page')}</a></p>
		<h1>{t('title')}</h1>
		<p class="muted">{t('intro')}</p>
		<p class="note">{t('safety')}</p>
	</header>

	{#if data.failed || !list}
		<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
	{:else}
		<nav aria-label={t('filters')}>
			<ul class="chips">
				<li>
					<a class="chip" href={href({ type: null })} aria-current={!data.type ? 'true' : undefined}
						>{t('filterAll')}{#if counts}
							<span class="count">{number(lang, total, 0)}</span>{/if}</a
					>
				</li>
				{#each PLACE_TYPES as type (type)}
					<li>
						<a class="chip" href={href({ type })} aria-current={data.type === type ? 'true' : undefined}
							>{t(`types.${type}`)}{#if counts}
								<span class="count">{number(lang, counts[type], 0)}</span>{/if}</a
						>
					</li>
				{/each}
			</ul>
		</nav>

		<form method="get" action="/sea/places" class="search" role="search">
			{#if data.type}<input type="hidden" name="type" value={data.type} />{/if}
			<label for="places-q">{t('searchLabel')}</label>
			<div class="field">
				<input id="places-q" type="search" name="q" value={data.q} maxlength="80" autocomplete="off" />
				<button type="submit" class="btn">{t('searchGo')}</button>
			</div>
		</form>

		<section class="where" aria-label={t('locate')}>
			{#if me}
				<p class="small">
					<b>{t('around', { place: me.name ?? t('myPosition') })}</b> ·
					<button type="button" class="link" onclick={() => (me = null)}>{t('stopLocate')}</button>
				</p>
			{/if}
			<p>
				<button type="button" class="btn quiet" onclick={locate} disabled={locating === 'busy'}
					>{locating === 'busy' ? t('locating') : t('locate')}</button
				>
				{#if locating === 'failed'}<span class="muted small">{t('locateFailed')}</span>{/if}
			</p>
			<p class="muted small">{t('locateNote')}</p>
		</section>

		{#if me}
			<section class="block" aria-live="polite">
				{#if nearby.status === 'loading'}
					<p class="muted">{t('searching')}</p>
				{:else if nearby.status === 'error'}
					<p class="note">{t('unavailable')} {t('unavailableHint')}</p>
				{:else if nearby.list}
					{#if nearby.list.places.length}
						<h2>{t('around', { place: me.name ?? t('myPosition') })}</h2>
						<ul class="places">
							{#each nearby.list.places as place (place.id)}<li><SeaPlaceRow {lang} {place} /></li>{/each}
						</ul>
					{:else}
						<p class="note">{t('none')} {t('noneHint')}</p>
					{/if}
				{/if}
			</section>
		{/if}

		{#if data.browsing}
			<section class="block">
				<h2>
					{data.type ? t(`types.${data.type}`) : t('title')}{#if data.q}
						· « {data.q} »{/if}
				</h2>
				<p class="muted small">{countText(list.count)}</p>
				{#if list.places.length}
					<ul class="places">
						{#each list.places as place (place.id)}<li><SeaPlaceRow {lang} {place} /></li>{/each}
					</ul>
					{#if pages > 1}
						<nav class="pager" aria-label={t('pageOf', { page: data.page, pages })}>
							{#if data.page > 1}<a href={href({ page: data.page - 1 })} rel="prev">← {t('previous')}</a>{/if}
							<span class="muted small">{t('pageOf', { page: data.page, pages })}</span>
							{#if data.page < pages}<a href={href({ page: data.page + 1 })} rel="next">{t('next')} →</a>{/if}
						</nav>
					{/if}
				{:else}
					<p class="note">{t('none')} {t('noneHint')}</p>
				{/if}
			</section>
		{:else if !me}
			<p class="muted">{t('start', { count: number(lang, total, 0) })}</p>
		{/if}
	{/if}

	<Credits {lang} credits={[list?.attribution]} />
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
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.chips a[aria-current='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.chips a[aria-current='true'] .count {
		color: var(--accent);
	}
	.search label {
		display: block;
		font-weight: 600;
		margin-bottom: 4px;
	}
	.field {
		display: flex;
		gap: 8px;
		max-width: 480px;
	}
	.field input {
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}
	.where p {
		margin: 4px 0;
	}
	.link {
		font: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		text-decoration: underline;
		cursor: pointer;
	}
	.block h2 {
		margin: 0 0 4px;
	}
	.places {
		margin: 8px 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 8px;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 8px;
	}
</style>
