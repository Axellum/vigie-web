<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Time from '$lib/components/Time.svelte';
	import { countryName, translator, type Key } from '$lib/i18n';
	import { slug } from '$lib/transform';
	import { createPasskey, passkeysBlocked, PasskeyProblem, type PasskeyFailure } from '$lib/passkey';

	let { data, form } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	let busy = $state(false);
	let added = $state(false);
	let problem = $state<PasskeyFailure | null>(null);
	let blocked = $state(false);
	onMount(() => (blocked = passkeysBlocked() !== null));

	async function addPasskey() {
		busy = true;
		problem = null;
		added = false;
		try {
			await createPasskey({});
			added = true;
			await invalidateAll();
		} catch (e) {
			problem = e instanceof PasskeyProblem ? e.code : 'refused';
		} finally {
			busy = false;
		}
	}

	const formError = $derived.by((): Key | null => {
		const code = (form as { error?: string } | null)?.error;
		if (code === 'confirm') return 'account.deleteMissing';
		if (code === 'last' || code === 'unknown') return `pk.${code}`;
		if (code?.startsWith('zone.')) return `zones.err.${code.slice(5)}` as Key;
		return null;
	});

	type Zone = (typeof data.zones)[number];
	const fmt = (v: number | null) => (v == null ? '–' : v.toFixed(3));
	function describe(z: Zone): string {
		switch (z.kind) {
			case 'circle':
				return tr('zones.describe.circle', { km: z.radiusKm ?? '–', lat: fmt(z.lat), lon: fmt(z.lon) });
			case 'polygon':
				return tr('zones.describe.polygon', { n: z.corners?.length ?? 0 });
			case 'country':
				return tr('zones.describe.country', { country: countryName(lang, z.country ?? '') });
			case 'area':
				return tr('zones.describe.area', { area: z.area ?? '', country: countryName(lang, z.country ?? '') });
		}
	}
	function view(z: Zone): string | null {
		if (z.kind === 'circle') return `/near#${z.lat},${z.lon},${z.radiusKm}`;
		if (z.kind === 'polygon') return `/account/zones/${z.id}`;
		if (!z.country || !data.served.includes(z.country)) return null;
		const cc = z.country.toLowerCase();
		return z.kind === 'area' && z.area ? `/country/${cc}/${slug(z.area)}` : `/country/${cc}`;
	}
	const rules = (z: Zone) =>
		`${tr(`zones.level.${z.minLevel}` as Key)} · ${z.kinds.map((k) => tr(`cat.${k}` as Key)).join(', ')}`;
</script>

<svelte:head>
	<title>Vigie · {tr('account.title')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page narrow">
	<header class="intro">
		<p class="eyebrow">{tr('account.title')}</p>
		<h1>{data.user.name}</h1>
		<p class="muted small">{tr('account.since')} <Time {lang} unix={data.user.createdAt} /></p>
	</header>

	<section class="card stack" id="zones">
		<h2>{tr('zones.title')}</h2>
		<p class="note">{tr('zones.notYet')}</p>
		{#if data.zones.length}
			<ul class="zones">
				{#each data.zones as z (z.id)}
					<li>
						<div>
							<p><b>{z.name}</b></p>
							<p class="small">{describe(z)}</p>
							<p class="muted small">{rules(z)}</p>
						</div>
						<div class="btn-row">
							{#if view(z)}<a href={view(z)}>{tr('zones.view')}</a>{/if}
							<form method="POST" action="?/removeZone" use:enhance>
								<input type="hidden" name="id" value={z.id} />
								<button type="submit" class="btn quiet">{tr('zones.remove')}</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{tr('zones.none')}</p>
		{/if}
		{#if (form as { zoneRemoved?: boolean } | null)?.zoneRemoved}<p role="status">
				{tr('zones.removed')}
			</p>{/if}
		{#if data.zones.length < data.maxZones}
			<div><a class="btn" href="/account/zones/new">{tr('zones.add')}</a></div>
		{:else}
			<p class="muted small">{tr('zones.full', { n: data.maxZones })}</p>
		{/if}
	</section>

	<section class="card stack">
		<h2>{tr('account.passkeys')}</h2>
		<ul class="keys">
			{#each data.passkeys as key (key.id)}
				<li>
					<div>
						<p>
							{tr('account.passkeyCreated')}
							<Time {lang} unix={key.createdAt} />
							{#if key.backedUp}<span class="muted small">· {tr('account.synced')}</span>{/if}
						</p>
						<p class="muted small">
							{tr('account.passkeyUsed')} :
							{#if key.lastUsedAt}<Time {lang} unix={key.lastUsedAt} />{:else}{tr('account.never')}{/if}
						</p>
					</div>
					{#if data.passkeys.length > 1}
						<form method="POST" action="?/removePasskey" use:enhance>
							<input type="hidden" name="id" value={key.id} />
							<button type="submit" class="btn quiet">{tr('account.remove')}</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="btn-row">
			<button type="button" class="btn" onclick={addPasskey} disabled={busy || blocked}>
				{busy ? tr('join.busy') : tr('account.add')}
			</button>
		</div>
		{#if added}<p role="status">{tr('account.added')}</p>{/if}
		{#if (form as { removed?: boolean } | null)?.removed}<p role="status">{tr('account.removed')}</p>{/if}
		{#if problem}<p class="error" role="alert">{tr(`pk.${problem}`)}</p>{/if}
		<p class="muted small">{tr('account.lostHelp')}</p>
	</section>

	<section class="card stack">
		<h2>{tr('account.data')}</h2>
		<p>
			<a href="/account/export.json" download>{tr('account.export')}</a> ·
			<a href="/privacy">{tr('nav.privacy')}</a>
		</p>
		<form method="POST" action="?/logout">
			<button type="submit" class="btn quiet">{tr('account.logout')}</button>
		</form>
	</section>

	<section class="card stack danger">
		<h2>{tr('account.delete')}</h2>
		<p>{tr('account.deleteHelp')}</p>
		<form method="POST" action="?/delete" class="stack">
			<label class="check"
				><input type="checkbox" name="confirm" value="yes" /> {tr('account.deleteConfirm')}</label
			>
			<div><button type="submit" class="btn danger">{tr('account.delete')}</button></div>
		</form>
	</section>
	{#if formError}<p class="error" role="alert">{tr(formError)}</p>{/if}
</div>

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.zones {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.zones li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.zones li > div:first-child {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	a.btn {
		display: inline-block;
		text-decoration: none;
	}
	.keys {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.keys li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.check {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.danger {
		border-color: var(--sev-red);
	}
</style>
