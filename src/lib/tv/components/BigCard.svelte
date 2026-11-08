<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvActivity } from '../model.js';
	import { activityLabel, tvText, verdictWord } from '../text.js';
	import ActivityIcon from './ActivityIcon.svelte';
	import Strip from './Strip.svelte';
	import VerdictIcon from './VerdictIcon.svelte';

	// The answer before the figures: a card per activity, its outline and its word in the colour of the verdict, the slot, what
	// holds it back, the criteria and the day hour by hour. `small` is the card of a screen with four of them.
	let {
		activity,
		lang,
		small = false
	}: { activity: TvActivity | undefined; lang: Lang; small?: boolean } = $props();
</script>

<div class="tv-card tv-bigcard tv-v-{activity?.verdict ?? 'null'}{small ? ' tv-bigcard-small' : ''}">
	{#if activity}
		<div class="tv-bigcard-head">
			<ActivityIcon id={activity.id} size={6.4} />
			<span class="tv-display tv-t50">{activityLabel(lang, activity.id)}</span>
		</div>
		<div class="tv-verdict">
			<VerdictIcon verdict={activity.verdict} size={small ? 10 : 13} />
			<span class="tv-display tv-verdict-word {small ? 'tv-t86' : 'tv-t110'}"
				>{verdictWord(lang, activity.verdict)}</span
			>
		</div>
		<div class="tv-line tv-nowrap">
			{#if !activity.available}
				<span class="tv-mut">{tvText(lang, 'cannotJudge')}</span>
			{:else}
				{tvText(lang, 'slot')} <b class="tv-mono">{activity.slot ?? tvText(lang, 'noSlot')}</b>
			{/if}
		</div>
		<div class="tv-sub tv-mut tv-reason">{activity.reason ?? ''}</div>
		{#if !small && activity.chips.length}
			<div class="tv-chips">
				{#each activity.chips as chip, i (i)}
					<span class="tv-chip tv-v-{chip.verdict}">
						<VerdictIcon verdict={chip.verdict} size={3.4} />
						<span class="tv-mut">{chip.name}</span> <b class="tv-mono">{chip.value}</b>
					</span>
				{/each}
			</div>
		{/if}
		<div class="tv-grow"></div>
		<div class="tv-strip-box {small ? 'tv-strip-small' : 'tv-strip-big'}">
			<Strip {activity} marks={!small} />
		</div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
