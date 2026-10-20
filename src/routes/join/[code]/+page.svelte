<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Time from '$lib/components/Time.svelte';
	import { translator } from '$lib/i18n';
	import { createPasskey, passkeysBlocked, PasskeyProblem, type PasskeyFailure } from '$lib/passkey';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	let name = $state('');
	let busy = $state(false);
	let problem = $state<PasskeyFailure | null>(null);
	onMount(() => (problem = passkeysBlocked()));
	const blocked = $derived(problem === 'insecure' || problem === 'unsupported');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		problem = null;
		try {
			await createPasskey(data.recoverName ? { code: data.code } : { code: data.code, name });
			await goto('/account', { invalidateAll: true, replaceState: true });
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
	{#if !data.valid}
		<h1>{tr('join.title')}</h1>
		<p class="error" role="alert">{tr('pk.invitation')}</p>
	{:else}
		<h1>{data.recoverName ? tr('join.recoverTitle', { name: data.recoverName }) : tr('join.title')}</h1>
		<p class="muted small">{tr('join.validUntil')} <Time {lang} unix={data.expiresAt} />.</p>
		<p>{tr('pk.what')}</p>
		<form class="form" onsubmit={submit}>
			{#if !data.recoverName}
				<label class="form-field">
					<span>{tr('join.name')}</span>
					<input
						class="input"
						name="name"
						bind:value={name}
						required
						maxlength="60"
						autocomplete="nickname"
					/>
					<span class="muted small">{tr('join.nameHelp')}</span>
				</label>
			{/if}
			<button type="submit" class="btn" disabled={busy || blocked}>
				{busy ? tr('join.busy') : data.recoverName ? tr('join.add') : tr('join.create')}
			</button>
		</form>
		{#if problem}<p class="error" role="alert">{tr(`pk.${problem}`)}</p>{/if}
		<p class="muted small">{tr('join.privacyLead')} <a href="/privacy">{tr('nav.privacy')}</a>.</p>
	{/if}
</div>
