<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { translator } from '#lib/i18n.js';
	import { createPasskey, passkeysBlocked, PasskeyProblem, type PasskeyFailure } from '#lib/passkey.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	let name = $state('');
	let busy = $state(false);
	let problem = $state<PasskeyFailure | null>(null);
	// The button waits for the page's script: a form sent before it runs would be sent as a plain page request.
	let ready = $state(false);
	onMount(() => {
		problem = passkeysBlocked();
		ready = true;
	});
	const blocked = $derived(problem === 'insecure' || problem === 'unsupported');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		problem = null;
		try {
			await createPasskey({ signup: true, name });
			await goto('/account#recovery', { refreshAll: true, replace: true });
		} catch (e) {
			problem = e instanceof PasskeyProblem ? e.code : 'refused';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Vigie · {tr('join.title')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page narrow">
	<h1>{tr('join.title')}</h1>
	{#if data.status === 'open'}
		<p>{tr('pk.what')}</p>
		<form class="form" onsubmit={submit}>
			<label class="form-field">
				<span>{tr('join.name')}</span>
				<input class="input" name="name" bind:value={name} required maxlength="60" autocomplete="nickname" />
				<span class="muted small">{tr('join.nameHelp')}</span>
			</label>
			<button type="submit" class="btn" disabled={busy || blocked || !ready}>
				{busy ? tr('join.busy') : tr('join.create')}
			</button>
		</form>
		{#if problem}<p class="error" role="alert">{tr(`pk.${problem}`)}</p>{/if}
		<p class="muted small">{tr('join.recoveryLead')}</p>
		<p class="muted small">{tr('join.privacyLead')} <a href="/privacy">{tr('nav.privacy')}</a>.</p>
	{:else if data.status === 'full'}
		<p class="note" role="status">{tr('join.full')}</p>
	{:else}
		<p class="note" role="status">{tr('login.invitationOnly')}</p>
	{/if}
	<p class="muted small"><a href="/login">{tr('login.title')}</a></p>
</div>
