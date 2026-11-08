<script lang="ts">
	// The top of a spot's page: "can I go in the water here, for my activity?" The activity the visitor chose (kept in this
	// browser only, see choice.ts) with its verdict, its best slot and the one reason that holds it back; the three others in
	// one line each, to switch with one tap. The cards below keep every detail. The verdicts are the API's and are not for safety.
	import {
		activityText,
		reasonText,
		type ActivitiesForecast,
		type ActivityId,
		type Verdict
	} from '#lib/activities.js';
	import type { Lang } from '#lib/i18n.js';
	import { hourLabel, slotLabel } from '#lib/surf.js';
	import { activityOnTop, nowVerdict } from './place.js';
	import { SLUGS } from './slugs.js';
	import { seaText } from './text.js';

	let {
		lang,
		v,
		active,
		onpick
	}: {
		lang: Lang;
		v: ActivitiesForecast;
		/** The activity the visitor chose, when this browser kept one; a surf spot's page shows the surf otherwise. */
		active: ActivityId | null;
		onpick: (id: ActivityId) => void;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	const glyph = (verdict: Verdict | null) =>
		verdict === 'good' ? '✓' : verdict === 'possible' ? '~' : verdict === 'poor' ? '✕' : '?';
	const word = (verdict: Verdict | null) =>
		verdict ? activityText(lang, `verdict.${verdict}`) : activityText(lang, 'unknown');

	const top = $derived(activityOnTop(v, active ?? 'surf'));
	const now = $derived(top ? nowVerdict(top, v.generated) : null);
	const why = $derived(top ? reasonText(lang, top.reason) : null);
</script>

<section class="card top" aria-labelledby="place-answer">
	<h2 id="place-answer">{t('placeTitle')}</h2>

	<div class="picks" role="group" aria-label={t('myActivity')}>
		{#each v.activities as a (a.id)}
			<button type="button" aria-pressed={top?.id === a.id} onclick={() => onpick(a.id)}>
				{activityText(lang, `activity.${a.id}`)}
				{#if a.available && a.verdict}
					<span class="hint v-{a.verdict}" aria-hidden="true">{glyph(a.verdict)}</span><span
						class="visually-hidden"
					>
						({word(a.verdict).toLowerCase()})</span
					>
				{/if}
			</button>
		{/each}
	</div>

	{#if top}
		<div class="answer" aria-live="polite">
			{#if !top.available}
				<p class="muted">{activityText(lang, 'unavailableActivity')}</p>
			{:else}
				<p class="line">
					<span class="chip v-{top.verdict ?? 'none'}"
						><span aria-hidden="true">{glyph(top.verdict)}</span> {word(top.verdict)}</span
					>
					<strong>{activityText(lang, `activity.${top.id}`)}</strong>
				</p>
				<p class="small">
					{#if top.slot}
						<b>{activityText(lang, 'slot')}</b>
						{slotLabel(lang, top.slot.start)} – {hourLabel(lang, top.slot.end)}
					{:else if top.verdict}
						{activityText(lang, 'noSlot')}
					{/if}
				</p>
				{#if why}<p class="muted small"><b>{activityText(lang, 'why')}</b> · {why}</p>{/if}
				{#if now && now !== top.verdict}
					<p class="muted small">{t('now')} : {word(now).toLowerCase()}</p>
				{/if}
			{/if}
			<p class="small"><a href="/sea/{SLUGS[top.id]}">{t('placeAll')}</a></p>
		</div>
	{/if}
</section>

<style>
	.top h2 {
		margin: 0 0 8px;
	}
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
	}
	.picks button {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		min-height: 44px;
		padding: 4px 14px;
		border: 1px solid var(--line);
		border-radius: 22px;
		background: var(--surface);
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.picks button:hover {
		border-color: var(--accent);
	}
	.picks button[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--surface);
	}
	.hint {
		display: inline-block;
		min-width: 1.4em;
		text-align: center;
		border-radius: 10px;
		font-size: 12px;
		line-height: 1.5;
		font-weight: 700;
	}
	.chip {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 2px 12px;
		border-radius: 12px;
		font-weight: 700;
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		margin: 0 0 4px;
		font-size: 18px;
	}
	.answer p {
		margin: 4px 0;
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
</style>
