<script lang="ts">
	// One spot for one activity: the verdict (a colour, a sign and a word, never the colour alone), the best slot, the one reason
	// that holds it back, and how far it is when a place is known. Every figure is the API's; what it did not give is left out.
	import { activityText, reasonText, type Verdict } from '#lib/activities.js';
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { hourLabel, slotLabel } from '#lib/surf.js';
	import type { SeaRow } from './overview.js';
	import { seaText } from './text.js';

	let { lang, row }: { lang: Lang; row: SeaRow } = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const verdict = $derived(row.activity.verdict);
	const glyph = (v: Verdict | null) =>
		v === 'good' ? '✓' : v === 'possible' ? '~' : v === 'poor' ? '✕' : '?';
	const word = (v: Verdict | null) =>
		v ? activityText(lang, `verdict.${v}`) : activityText(lang, 'unknown');
	const why = $derived(reasonText(lang, row.activity.reason));
	const where = $derived(
		[row.spot.place, row.km != null ? t('away', { km: number(lang, row.km, row.km < 10 ? 1 : 0) }) : null]
			.filter(Boolean)
			.join(' · ')
	);
	const warning = $derived(
		row.spot.coastalLevel === 'RED'
			? t('warnRed')
			: row.spot.coastalLevel === 'ORANGE'
				? t('warnOrange')
				: null
	);
</script>

<a class="row" href="/surf/{row.spot.id}">
	<span class="chip v-{verdict ?? 'none'}"
		><span aria-hidden="true">{glyph(verdict)}</span> {word(verdict)}</span
	>
	<span class="body">
		<strong>{row.spot.name}</strong>
		{#if where}<span class="muted small">{where}</span>{/if}
		{#if row.activity.slot}
			<span class="small"
				><b>{activityText(lang, 'slot')}</b>
				{slotLabel(lang, row.activity.slot.start)} – {hourLabel(lang, row.activity.slot.end)}</span
			>
		{:else if verdict && verdict !== 'poor'}
			<span class="small">{activityText(lang, 'noSlot')}</span>
		{/if}
		{#if why}<span class="muted small"><b>{activityText(lang, 'why')}</b> · {why}</span>{/if}
		{#if row.activity.now && row.activity.now !== verdict}
			<span class="muted small">{t('now')} : {word(row.activity.now).toLowerCase()}</span>
		{/if}
		{#if warning}<span class="small warn">{warning}</span>{/if}
		{#if row.spot.warnings === 'unknown'}
			<span class="muted small" title={t('warnUnknownTitle')}>{t('warnUnknown')}</span>
		{/if}
	</span>
</a>

<style>
	.row {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.row:hover {
		border-color: var(--accent);
	}
	.chip {
		flex: none;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 2px 10px;
		border-radius: 12px;
		font-weight: 600;
		font-size: 14px;
		min-width: 7.5em;
		justify-content: center;
	}
	.v-good {
		background: var(--sev-green);
		color: var(--on-sev);
	}
	.v-possible {
		background: var(--sev-yellow);
		color: var(--on-yellow);
	}
	.v-poor {
		background: var(--sev-red);
		color: var(--on-sev);
	}
	.v-none {
		border: 1px dashed var(--sev-none);
		color: var(--muted);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.warn {
		font-weight: 600;
	}
</style>
