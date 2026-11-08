<script lang="ts">
	import { translator, type Key } from '#lib/i18n.js';

	let { data, form } = $props();
	const lang = $derived(data.lang);
	const tr = $derived(translator(lang));
	const formError = $derived((form as { error?: Key } | null)?.error);
</script>

<svelte:head>
	<title>Vigie · {tr('recover.title')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page narrow">
	<h1>{tr('recover.title')}</h1>
	<p>{tr('recover.help')}</p>
	<form method="POST" class="form">
		<label class="form-field">
			<span>{tr('recover.code')}</span>
			<input
				class="input"
				name="code"
				required
				maxlength="64"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				inputmode="text"
			/>
			<span class="muted small">{tr('recover.codeHelp')}</span>
		</label>
		<button type="submit" class="btn">{tr('recover.button')}</button>
	</form>
	{#if formError}<p class="error" role="alert">{tr(formError)}</p>{/if}
	<p class="muted small"><a href="/login">{tr('login.title')}</a></p>
</div>
