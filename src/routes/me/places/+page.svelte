<script lang="ts">
	// "My places": the places of "My page", kept in the account. A place is searched by name, taken from the
	// position of the browser (only when asked) or clicked on the map; it stays in the browser until "Save". The
	// home is one of them, kept to about 1 km and shown to nobody.
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import MapView from '#lib/components/MapView.svelte';
	import PlaceSearch from '#lib/components/PlaceSearch.svelte';
	import { translator, type Key } from '#lib/i18n.js';
	import { DEFAULT_RADIUS_KM, roundCoordinate, type PlaceKind } from '#lib/myPlaces.js';
	import { circleBox, type Place } from '#lib/near.js';
	import { asProfile, PROFILES } from '#lib/profiles.js';
	import { ZONE_RADII_KM } from '#lib/zones.js';

	let { data, form } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	type Editing = { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'home' };
	let editing = $state<Editing | null>(null);
	let point = $state<Place | null>(null);
	let name = $state('');
	let radiusKm = $state(DEFAULT_RADIUS_KM);
	let profile = $state('');
	let cards = $state(true);
	let named = false;
	let locate = $state<'idle' | 'busy' | 'denied' | 'unsupported'>('idle');
	/** The place whose removal is being asked for, then confirmed. */
	let asking = $state<string | null>(null);
	let said = $state('');

	const home = $derived(data.places.find((p) => p.kind === 'home') ?? null);
	const others = $derived(data.places.filter((p) => p.kind === 'place'));
	const full = $derived(others.length >= data.max);
	/** What the form keeps of the kind it edits: the home to about 1 km, a place to about 100 m. */
	const kind = $derived<PlaceKind>(
		editing?.kind === 'home' || (editing?.kind === 'edit' && editing.id === home?.id) ? 'home' : 'place'
	);
	const kept = $derived(
		point ? { lat: roundCoordinate(point.lat, kind), lon: roundCoordinate(point.lon, kind) } : null
	);
	const fmt = (v: number) => v.toFixed(kind === 'home' ? 2 : 3);
	const action = $derived(
		editing?.kind === 'edit' ? '?/update' : editing?.kind === 'home' ? '?/home' : '?/add'
	);
	/** Cards are offered for a place that is new to the page: a new place, or a home that is set for the first time. */
	const offersCards = $derived(editing?.kind === 'add' || (editing?.kind === 'home' && !home));
	const error = $derived.by((): Key | null => {
		const code = (form as { error?: string } | null)?.error;
		return code ? (`places.err.${code}` as Key) : null;
	});

	async function open(next: Editing, from?: (typeof data.places)[number]) {
		editing = next;
		asking = null;
		said = '';
		locate = 'idle';
		// A place found by name takes that name; the home and a place being edited keep theirs.
		named = from !== undefined || next.kind === 'home';
		point = from ? { lat: from.lat, lon: from.lon } : null;
		name = from?.name ?? (next.kind === 'home' ? tr('places.homeName') : '');
		radiusKm = from?.radiusKm ?? DEFAULT_RADIUS_KM;
		profile = from?.profile ?? '';
		cards = true;
		await tick();
		document.getElementById('place-search')?.focus();
	}

	function pick(p: Place, label?: string) {
		point = { lat: p.lat, lon: p.lon };
		if (!named && label) name = label.slice(0, 60);
	}

	function locateMe() {
		if (!('geolocation' in navigator)) {
			locate = 'unsupported';
			return;
		}
		locate = 'busy';
		navigator.geolocation.getCurrentPosition(
			(position) => {
				locate = 'idle';
				pick({ lat: position.coords.latitude, lon: position.coords.longitude });
			},
			() => (locate = 'denied'),
			{ enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }
		);
	}

	const submit: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				const done = (result.data as { done?: string } | undefined)?.done;
				said = done ? tr(`places.done.${done}` as Key) : '';
				editing = null;
				asking = null;
			}
		};

	const frame = $derived(point ? circleBox(point, radiusKm) : null);
</script>

<svelte:head>
	<title>Vigie · {tr('places.title')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page places">
	<header class="intro">
		<p class="eyebrow"><a href="/me">{tr('nav.me')}</a></p>
		<h1>{tr('places.title')}</h1>
		<p class="muted">{tr('places.intro')}</p>
	</header>

	<p class="status" role="status">{said}</p>

	<section class="card stack" aria-labelledby="home-title">
		<h2 id="home-title">{tr('places.home')}</h2>
		{#if home}
			<p>
				<strong>{home.name}</strong> · {home.radiusKm} km
			</p>
		{:else}
			<p class="muted">{tr('places.homeNone')}</p>
		{/if}
		<p class="muted small">{tr('places.homeNote')}</p>
		<p class="btn-row">
			<button
				type="button"
				class="btn quiet"
				onclick={() => (home ? open({ kind: 'edit', id: home.id }, home) : open({ kind: 'home' }))}
				>{home ? tr('places.homeChange') : tr('places.homeSet')}</button
			>
		</p>
	</section>

	<section class="card stack" aria-labelledby="list-title">
		<h2 id="list-title">{tr('places.list')}</h2>
		{#if others.length === 0}
			<p class="muted">{tr('places.none')}</p>
		{:else}
			<ul class="items">
				{#each others as p (p.id)}
					<li>
						<div class="what">
							<strong>{p.name}</strong>
							<span class="muted small">
								{p.radiusKm} km{#if asProfile(p.profile)}
									· {tr(`profile.${p.profile}` as Key)}{/if}
							</span>
						</div>
						{#if asking === p.id}
							<form method="POST" action="?/remove" class="ask" use:enhance={submit}>
								<input type="hidden" name="id" value={p.id} />
								<span id={`ask-${p.id}`}>{tr('places.removeAsk', { name: p.name })}</span>
								<button type="submit" class="btn danger" aria-describedby={`ask-${p.id}`}
									>{tr('places.removeYes')}</button
								>
								<button type="button" class="btn quiet" onclick={() => (asking = null)}
									>{tr('places.removeNo')}</button
								>
							</form>
						{:else}
							<span class="btn-row">
								<button
									type="button"
									class="btn quiet"
									aria-label={`${tr('places.edit')} ${p.name}`}
									onclick={() => open({ kind: 'edit', id: p.id }, p)}>{tr('places.edit')}</button
								>
								<button
									type="button"
									class="btn quiet"
									aria-label={`${tr('places.remove')} ${p.name}`}
									onclick={() => (asking = p.id)}>{tr('places.remove')}</button
								>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if full}
			<p class="note">{tr('places.full', { n: data.max })}</p>
		{:else}
			<p class="btn-row">
				<button type="button" class="btn" id="add-place" onclick={() => open({ kind: 'add' })}
					>+ {tr('places.add')}</button
				>
			</p>
		{/if}
	</section>

	{#if editing}
		<section class="card editor" aria-labelledby="editor-title">
			<div class="side stack">
				<h2 id="editor-title">
					{editing.kind === 'home' || kind === 'home'
						? tr('places.homeTitle')
						: editing.kind === 'edit'
							? tr('places.editTitle')
							: tr('places.addTitle')}
				</h2>
				<PlaceSearch {lang} id="place-search" onpick={(p, label) => pick(p, label)} />
				<p class="btn-row">
					<button type="button" class="btn quiet" onclick={locateMe} disabled={locate === 'busy'}>
						{locate === 'busy' ? tr('near.locating') : tr('near.locate')}
					</button>
				</p>
				{#if locate === 'denied'}
					<p class="note">{tr('near.denied')}</p>
				{:else if locate === 'unsupported'}
					<p class="note">{tr('near.unsupported')}</p>
				{/if}
				<p class="muted small" id="picked">
					{#if kept}
						{tr(kind === 'home' ? 'places.pickedHome' : 'places.picked', {
							lat: fmt(kept.lat),
							lon: fmt(kept.lon)
						})}
					{:else}
						{tr('places.pickHint')}
					{/if}
				</p>

				<!-- Sent without reloading the page, so that a refused place keeps what was typed. -->
				<form method="POST" {action} class="form" use:enhance={submit}>
					{#if editing.kind === 'edit'}<input type="hidden" name="id" value={editing.id} />{/if}
					{#if kept}
						<input type="hidden" name="lat" value={kept.lat} />
						<input type="hidden" name="lon" value={kept.lon} />
					{/if}
					<label class="form-field">
						<span>{tr('places.name')}</span>
						<input
							class="input"
							name="name"
							required
							maxlength="60"
							bind:value={name}
							oninput={() => (named = true)}
						/>
					</label>
					<label class="form-field">
						<span>{tr('places.radius')}</span>
						<select class="input" name="radiusKm" bind:value={radiusKm}>
							{#each ZONE_RADII_KM as r (r)}<option value={r}>{r} km</option>{/each}
						</select>
					</label>
					<label class="form-field">
						<span>{tr('places.profile')}</span>
						<select class="input" name="profile" bind:value={profile}>
							<option value="">{tr('profile.none')}</option>
							{#each PROFILES as p (p)}<option value={p}>{tr(`profile.${p}` as Key)}</option>{/each}
						</select>
					</label>
					{#if offersCards}
						<label class="check">
							<input type="checkbox" name="cards" bind:checked={cards} />
							{tr('places.cards')}
						</label>
					{/if}
					<p class="btn-row">
						<button type="submit" class="btn" disabled={!kept}>{tr('places.save')}</button>
						<button type="button" class="btn quiet" onclick={() => (editing = null)}
							>{tr('places.cancel')}</button
						>
					</p>
					{#if error}<p class="error" role="alert">{tr(error, { n: data.max })}</p>{/if}
				</form>
			</div>
			<div class="map">
				<MapView
					{lang}
					{frame}
					place={kept ? { ...kept, radiusKm } : null}
					onpick={(p) => pick(p)}
					label={tr('places.mapLabel')}
				/>
			</div>
		</section>
	{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 70ch;
	}
	.status:empty {
		display: none;
	}
	.status {
		margin: 0;
		font-weight: 600;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.items li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		padding: 10px 0;
	}
	.items li + li {
		border-top: 1px solid var(--line);
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.ask {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.editor {
		display: grid;
		gap: 16px;
	}
	@media (min-width: 900px) {
		.editor {
			grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
			align-items: start;
		}
	}
	.map {
		height: 460px;
		min-width: 0;
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 14px;
	}
</style>
