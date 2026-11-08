<script lang="ts">
	// The private links of "My page": one makes an address that shows the page on a screen with no keyboard (a television, a
	// tablet on a wall), and revokes it when the screen is gone. The address is shown once, in the answer of the form that made
	// it, then nowhere: the site keeps only its fingerprint (src/lib/server/pageLinks.ts, ADR 0020 of vigie-api).
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { translator, type Lang } from '#lib/i18n.js';
	import Time from './Time.svelte';

	interface Link {
		/** The fingerprint that names the link for "revoke"; it cannot open it. */
		id: string;
		label: string;
		createdAt: number;
		lastOpenedAt: number | null;
	}

	let {
		lang,
		pageId,
		blocks,
		links,
		maxLinks,
		tvCards,
		made,
		error
	}: {
		lang: Lang;
		pageId: string;
		blocks: { type: string }[];
		links: Link[];
		maxLinks: number;
		/** The cards a screen draws; the others are left out of its turns. */
		tvCards: string[];
		/** The path of the link just made (`/tv/p/<secret>`), only in the answer that made it. */
		made: string | null;
		error: string | null;
	} = $props();
	const tr = $derived(translator(lang));

	const shown = $derived(blocks.filter((b) => tvCards.includes(b.type)).length);
	const full = $derived(links.length >= maxLinks);
	// The address of the screen is this site's, followed by the path that was made.
	const address = $derived(made ? `${page.url.origin}${made}` : '');
	// Opened by the person, and by the link just made so that it is seen; never closed by an answer.
	let opened = $state(false);
	$effect(() => {
		if (made) opened = true;
	});

	let asking = $state<string | null>(null);
	let copied = $state(false);
	let revoked = $state(false);
	// The button waits for the page's script: a form sent before it runs would be a plain page request, and its answer (the
	// address, shown once) would then be sent again by a reload.
	let ready = $state(false);
	onMount(() => (ready = true));
	async function copy() {
		const field = document.getElementById('link-address') as HTMLInputElement | null;
		try {
			await navigator.clipboard.writeText(address);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No clipboard (an address that is not secure, an old browser): select the address so that it can be copied by hand.
			field?.select();
		}
	}
</script>

<details class="card links" id="links" bind:open={opened}>
	<summary>{tr('links.title')}</summary>
	<div class="body">
		<p class="muted small">{tr('links.lead')}</p>
		<p class="muted small">{tr('links.drawn')}</p>
		<p class="muted small">
			{shown > 0 ? tr('links.count', { shown, total: blocks.length }) : tr('links.countNone')}
		</p>

		{#if made}
			<div class="made" role="status">
				<p><strong>{tr('links.made')}</strong></p>
				<label class="form-field">
					<span>{tr('links.address')}</span>
					<input
						id="link-address"
						class="input"
						type="text"
						readonly
						value={address}
						autocomplete="off"
						onfocus={(e) => e.currentTarget.select()}
					/>
				</label>
				<p class="btn-row">
					<button type="button" class="btn" onclick={copy}>{tr('links.copy')}</button>
					<span class="muted small" role="status">{copied ? tr('links.copied') : ''}</span>
				</p>
				<p class="muted small">{tr('links.options')}</p>
			</div>
		{/if}

		{#if error === 'full'}
			<p class="note" role="alert">{tr('links.full', { max: maxLinks })}</p>
		{:else if error === 'unknown'}
			<p class="note" role="alert">{tr('links.errorUnknown')}</p>
		{/if}

		<form
			method="POST"
			action="?/linkMake"
			class="form make"
			use:enhance={() => {
				revoked = false;
				copied = false;
				return async ({ update }) => update();
			}}
		>
			<input type="hidden" name="page" value={pageId} />
			<label class="form-field">
				<span>{tr('links.label')}</span>
				<input
					class="input"
					type="text"
					name="label"
					maxlength="60"
					placeholder={tr('links.labelHint')}
					autocomplete="off"
				/>
			</label>
			<p class="btn-row">
				<button type="submit" class="btn" disabled={full || !ready}>{tr('links.make')}</button>
			</p>
			{#if full}<p class="muted small">{tr('links.full', { max: maxLinks })}</p>{/if}
		</form>

		<h3>{tr('links.active')}</h3>
		{#if links.length === 0}
			<p class="muted">{tr('links.none')}</p>
		{:else}
			<ul class="items">
				{#each links as l (l.id)}
					<li>
						<div class="what">
							<strong>{l.label || tr('links.unnamed')}</strong>
							<span class="muted small">
								{tr('links.createdOn')}
								<Time {lang} unix={l.createdAt} /> ·
								{#if l.lastOpenedAt}
									{tr('links.lastOpened')} <Time {lang} unix={l.lastOpenedAt} />
								{:else}
									{tr('links.neverOpened')}
								{/if}
							</span>
						</div>
						{#if asking === l.id}
							<form
								method="POST"
								action="?/linkRevoke"
								class="ask"
								use:enhance={() => {
									return async ({ update }) => {
										await update();
										asking = null;
										revoked = true;
									};
								}}
							>
								<input type="hidden" name="id" value={l.id} />
								<span id={`ask-${l.id}`}
									>{tr('links.revokeAsk', { name: l.label || tr('links.unnamed') })}</span
								>
								<button type="submit" class="btn danger" aria-describedby={`ask-${l.id}`}
									>{tr('links.revokeYes')}</button
								>
								<button type="button" class="btn quiet" onclick={() => (asking = null)}
									>{tr('links.revokeNo')}</button
								>
							</form>
						{:else}
							<div class="btn-row">
								<button
									type="button"
									class="btn quiet"
									aria-label={`${tr('links.revoke')} ${l.label || tr('links.unnamed')}`}
									onclick={() => (asking = l.id)}>{tr('links.revoke')}</button
								>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p class="muted small" role="status">{revoked ? tr('links.revoked') : ''}</p>
	</div>
</details>

<style>
	.links summary {
		cursor: pointer;
		font-weight: 600;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 12px;
	}
	.body p {
		margin: 0;
	}
	.make {
		max-width: 420px;
	}
	.made {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
	}
	.made .input {
		font-family: ui-monospace, monospace;
		width: 100%;
		/* The whole address in view: the site's fields stop at 360 px, the address is longer. */
		max-width: 100%;
	}
	h3 {
		margin: 4px 0 0;
		font-size: 1rem;
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
</style>
