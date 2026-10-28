<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { translator } from '#lib/i18n.js';
	import { passkeysBlocked, PasskeyProblem, signIn, type PasskeyFailure } from '#lib/passkey.js';

	let { data } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));

	let busy = $state(false);
	let problem = $state<PasskeyFailure | null>(null);
	onMount(() => (problem = passkeysBlocked()));

	async function go() {
		busy = true;
		problem = null;
		try {
			await signIn();
			await goto('/account', { invalidateAll: true });
		} catch (e) {
			problem = e instanceof PasskeyProblem ? e.code : 'refused';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Vigie · {tr('login.title')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page narrow">
	<h1>{tr('login.title')}</h1>
	{#if data.deleted}<p class="note" role="status">{tr('login.deleted')}</p>{/if}
	<p>{tr('login.invitationOnly')}</p>
	<button
		type="button"
		class="btn"
		onclick={go}
		disabled={busy || problem === 'insecure' || problem === 'unsupported'}
	>
		{busy ? tr('login.busy') : tr('login.button')}
	</button>
	{#if problem}<p class="error" role="alert">{tr(`pk.${problem}`)}</p>{/if}
	<p class="muted small">{tr('pk.what')}</p>
</div>
