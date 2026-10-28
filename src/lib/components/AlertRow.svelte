<script lang="ts">
	import { number, relative } from '#lib/format.js';
	import { countryName, t, tOr, type Key, type Lang } from '#lib/i18n.js';
	import { hazardHref, warningHref, warningTitle, type Row } from '#lib/rows.js';

	interface Props {
		lang: Lang;
		row: Row;
		now: number;
		selected?: boolean;
		/** When given, the row is a button (the map page); otherwise a link to the alert's page. */
		onpick?: (row: Row) => void;
	}
	let { lang, row, now, selected = false, onpick }: Props = $props();

	const title = $derived(row.kind === 'hazard' ? row.hazard.title : warningTitle(row.warning, lang));
	const where = $derived(
		row.kind === 'hazard'
			? `${tOr(lang, `cat1.${row.category}`, row.category)} · ${row.hazard.sources.join(', ')}`
			: [row.warning.area, countryName(lang, row.warning.cc)].filter(Boolean).join(' · ')
	);
	const value = $derived(
		row.kind === 'hazard' && row.hazard.value != null
			? `${row.category === 'EARTHQUAKE' ? 'M ' : ''}${number(lang, row.hazard.value)}`
			: ''
	);
	const unit = $derived(row.kind === 'hazard' ? (row.hazard.unit ?? '') : '');
	const levelText = $derived(row.level ? t(lang, `level.${row.level}` as Key) : t(lang, 'level.none'));
	const href = $derived(row.kind === 'hazard' ? hazardHref(row.hazard) : warningHref(row.warning));
</script>

{#snippet body()}
	<span class="stripe" aria-hidden="true"></span>
	<span class="text">
		<span class="title">{title}</span>
		<span class="meta">{where} · {relative(lang, row.time, now)} · {levelText}</span>
	</span>
	<span class="value"
		>{value}{#if unit}&nbsp;<small>{unit}</small>{/if}</span
	>
{/snippet}

{#if onpick}
	<button type="button" class="row sev-{row.level ?? 'NONE'}" class:selected onclick={() => onpick(row)}>
		{@render body()}
	</button>
{:else}
	<a class="row sev-{row.level ?? 'NONE'}" {href}>{@render body()}</a>
{/if}

<style>
	.row {
		display: grid;
		grid-template-columns: 4px minmax(0, 1fr) auto;
		gap: 0 10px;
		align-items: start;
		width: 100%;
		padding: 9px 2px 9px 0;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		text-align: left;
		cursor: pointer;
		color: var(--ink);
		text-decoration: none;
	}
	.row:hover {
		background: var(--bg);
	}
	.row.selected {
		background: var(--accent-soft);
	}
	.stripe {
		align-self: stretch;
		border-radius: 2px;
		background: var(--c);
	}
	.text {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.title {
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.meta {
		font-size: 12.5px;
		color: var(--muted);
	}
	.value {
		font-family: var(--font-data);
		font-size: 13px;
		white-space: nowrap;
		padding-top: 1px;
	}
	.value small {
		color: var(--muted);
		font-size: 11px;
	}
</style>
