<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import LevelPill from '$lib/components/LevelPill.svelte';
	import Time from '$lib/components/Time.svelte';
	import { countryName, translator, type Key } from '$lib/i18n';
	import { slug } from '$lib/transform';
	import { createPasskey, passkeysBlocked, PasskeyProblem, type PasskeyFailure } from '$lib/passkey';
	import { disablePush, enablePush, pushSupported, testPush, thisDevice } from '$lib/notifications';

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

	// Notifications on this device: what the browser can do, and whether the server knows this device.
	let canPush = $state(true);
	let deviceId = $state<string | null>(null);
	let pushBusy = $state(false);
	let pushNote = $state<Key | null>(null);
	onMount(async () => {
		canPush = pushSupported();
		if (canPush && data.push.publicKey) deviceId = await thisDevice();
	});

	async function pushAction(run: () => Promise<Key | null>) {
		pushBusy = true;
		pushNote = null;
		try {
			pushNote = await run();
			deviceId = await thisDevice();
			await invalidateAll();
		} finally {
			pushBusy = false;
		}
	}
	const turnOn = () =>
		pushAction(async () => {
			const result = await enablePush(data.push.publicKey ?? '');
			return result === 'ok' ? null : result === 'denied' ? 'push.denied' : 'push.failed';
		});
	const turnOff = () => pushAction(async () => (await disablePush(), null));
	const sendTest = () => pushAction(async () => ((await testPush()) ? 'push.testSent' : 'push.testFailed'));

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
		{#if !data.push.publicKey}<p class="note">{tr('zones.notYet')}</p>{/if}
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

	<section class="card stack" id="notifications">
		<h2>{tr('push.title')}</h2>
		{#if !data.push.publicKey}
			<p class="muted">{tr('push.off')}</p>
		{:else}
			<p>{tr('push.intro')}</p>
			{#if !canPush}
				<p class="note">{tr('push.unsupported')}</p>
			{:else}
				{#if deviceId}<p role="status">{tr('push.enabled')}</p>{/if}
				<div class="btn-row">
					{#if deviceId}
						<button type="button" class="btn" onclick={sendTest} disabled={pushBusy}>{tr('push.test')}</button
						>
						<button type="button" class="btn quiet" onclick={turnOff} disabled={pushBusy}
							>{tr('push.disable')}</button
						>
					{:else}
						<button type="button" class="btn" onclick={turnOn} disabled={pushBusy}
							>{pushBusy ? tr('join.busy') : tr('push.enable')}</button
						>
					{/if}
				</div>
				{#if pushNote}<p role={pushNote === 'push.testSent' ? 'status' : 'alert'}>{tr(pushNote)}</p>{/if}
			{/if}
			<h3>{tr('push.devices')}</h3>
			{#if data.push.devices.length}
				<ul class="keys">
					{#each data.push.devices as d (d.id)}
						<li>
							<div>
								<p>
									{d.service ? tr('push.device', { service: d.service }) : tr('push.deviceApp')}
									<Time {lang} unix={d.createdAt} />
									{#if d.id === deviceId}<span class="muted small">· {tr('push.thisDevice')}</span>{/if}
								</p>
								{#if d.lastSentAt}<p class="muted small">
										{tr('push.lastSent')} : <Time {lang} unix={d.lastSentAt} />
									</p>{/if}
							</div>
							<form method="POST" action="?/removeDevice" use:enhance>
								<input type="hidden" name="id" value={d.id} />
								<button type="submit" class="btn quiet">{tr('account.remove')}</button>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">{tr('push.noDevice')}</p>
			{/if}
			<form method="POST" action="?/quiet" use:enhance class="stack">
				<label class="check"
					><input type="checkbox" name="quiet" checked={data.push.quietHours} /> {tr('push.quiet')}</label
				>
				<div><button type="submit" class="btn quiet">{tr('push.save')}</button></div>
			</form>
			{#if (form as { quietSaved?: boolean } | null)?.quietSaved}<p role="status">{tr('push.saved')}</p>{/if}
		{/if}
	</section>

	<section class="card stack" id="history">
		<h2>{tr('push.history')}</h2>
		{#if data.alerts.length}
			<ul class="history">
				{#each data.alerts as a, i (i)}
					<li>
						<LevelPill {lang} level={a.level} />
						<div>
							<p><a href={a.url}>{a.title}</a></p>
							<p class="muted small">
								{a.zone} · <Time {lang} unix={a.matchedAt} /> · {tr(`push.outcome.${a.outcome}` as Key)}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{tr('push.historyNone')}</p>
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
	.history {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.history li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.history li > div {
		min-width: 0;
		overflow-wrap: anywhere;
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
