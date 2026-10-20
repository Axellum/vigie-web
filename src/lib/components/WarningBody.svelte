<script lang="ts">
	// The facts and the official text of a warning. The text is the issuer's, unchanged; the site's own
	// labels (level, phenomenon) are said to be derived.
	import { translator, type Lang } from '$lib/i18n';
	import { pickText } from '$lib/transform';
	import type { WarningDetail } from '$lib/types';
	import Time from './Time.svelte';

	let { lang, detail }: { lang: Lang; detail: WarningDetail } = $props();
	const tr = $derived(translator(lang));
	const text = $derived(pickText(detail.texts, lang));
	const others = $derived(
		detail.texts.filter((x) => x !== text && (x.description || x.instruction || x.headline))
	);
	const onMap = $derived.by(() => {
		if (!detail.geometry) return tr('detail.onMapNone');
		if (detail.geometrySource === 'line') return tr('detail.onMapLine');
		if (detail.geometrySource?.startsWith('geocode:'))
			return tr('detail.onMapShape', { code: detail.geometrySource.split(':').slice(1).join(' ') });
		return tr('detail.onMapPolygon');
	});
</script>

<dl class="facts">
	{#if text?.senderName || detail.issuer}
		<dt>{tr('detail.issuer')}</dt>
		<dd>{text?.senderName ?? detail.issuer}</dd>
	{/if}
	{#if detail.onset != null}
		<dt>{tr('detail.onset')}</dt>
		<dd><Time {lang} unix={detail.onset} /></dd>
	{/if}
	{#if detail.ends != null}
		<dt>{tr('detail.ends')}</dt>
		<dd><Time {lang} unix={detail.ends} /></dd>
	{/if}
	{#if detail.expires != null}
		<dt>{tr('detail.expires')}</dt>
		<dd><Time {lang} unix={detail.expires} /></dd>
	{/if}
	{#if detail.sent != null}
		<dt>{tr('detail.sent')}</dt>
		<dd><Time {lang} unix={detail.sent} /></dd>
	{/if}
	{#if detail.levelOriginal}
		<dt>{tr('detail.levelOriginal')}</dt>
		<dd>{detail.levelOriginal}</dd>
	{/if}
	<dt>{tr('detail.onMap')}</dt>
	<dd>{onMap}</dd>
</dl>

{#if text && (text.description || text.instruction)}
	<div class="official" lang={text.language || undefined}>
		<span class="eyebrow">{tr('detail.official', { lang: text.language || '?' })}</span>
		{#if text.description}<p>{text.description}</p>{/if}
		{#if text.instruction}
			<span class="eyebrow">{tr('detail.instruction')}</span>
			<p>{text.instruction}</p>
		{/if}
	</div>
{:else if !text}
	<p class="muted">{tr('detail.officialNone')}</p>
{/if}

{#if others.length}
	<details>
		<summary>{tr('detail.otherLanguages')} ({others.map((o) => o.language).join(', ')})</summary>
		{#each others as other (other.language)}
			<div class="official" lang={other.language || undefined}>
				<span class="eyebrow">{other.language}</span>
				{#if other.headline}<p><strong>{other.headline}</strong></p>{/if}
				{#if other.description}<p>{other.description}</p>{/if}
				{#if other.instruction}<p>{other.instruction}</p>{/if}
			</div>
		{/each}
	</details>
{/if}

<div class="links">
	{#if detail.web}<a href={detail.web} target="_blank" rel="noopener">{tr('detail.atSource')}</a>{/if}
	{#if detail.link}<a href={detail.link} target="_blank" rel="noopener">{tr('detail.cap')}</a>{/if}
</div>
{#if detail.attribution}<p class="credit">{detail.attribution}</p>{/if}
<p class="credit">{tr('detail.derived')}</p>

<style>
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
	}
	details {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	summary {
		cursor: pointer;
		color: var(--accent);
		font-size: 14px;
	}
	details .official {
		margin-top: 10px;
	}
</style>
