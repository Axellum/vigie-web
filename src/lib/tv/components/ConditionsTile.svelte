<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvActivity } from '../model.js';
	import { activityShort, tvText, verdictWord } from '../text.js';
	import VerdictIcon from './VerdictIcon.svelte';

	// The four verdicts of the day in a list: what a passer-by in front of a window wants first.
	let { activities, lang }: { activities: TvActivity[]; lang: Lang } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'conditions')}</div>
	{#if activities.length}
		<div class="tv-rows">
			{#each activities as a (a.id)}
				<div class="tv-row-item tv-v-{a.verdict ?? 'null'}">
					<VerdictIcon verdict={a.verdict} size={6.4} />
					<div class="tv-grow tv-row-text">
						<div class="tv-row-name">{activityShort(lang, a.id)}</div>
						<div class="tv-mono tv-mut tv-t28 tv-nowrap">
							{a.available ? (a.slot ?? tvText(lang, 'noSlot')) : tvText(lang, 'cannotJudge')}
						</div>
					</div>
					<div class="tv-display tv-t42 tv-verdict-word">{verdictWord(lang, a.verdict)}</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
