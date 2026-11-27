<script lang="ts">
	// The verdict of a spot for an activity: a colour, a sign and a word, never the colour alone. The list of the sea page and the
	// card of a town show the same one.
	import { activityText, type Verdict } from '#lib/activities.js';
	import type { Lang } from '#lib/i18n.js';

	let { lang, verdict }: { lang: Lang; verdict: Verdict | null } = $props();

	const glyph = $derived(
		verdict === 'good' ? '✓' : verdict === 'possible' ? '~' : verdict === 'poor' ? '✕' : '?'
	);
	const word = $derived(verdict ? activityText(lang, `verdict.${verdict}`) : activityText(lang, 'unknown'));
</script>

<span class="chip v-{verdict ?? 'none'}"><span aria-hidden="true">{glyph}</span> {word}</span>

<style>
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
</style>
