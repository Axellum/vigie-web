<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Time from '$lib/components/Time.svelte';
	import { translator, type Key } from '$lib/i18n';
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
		return null;
	});
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

	<p class="note">{tr('account.soon')}</p>

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
