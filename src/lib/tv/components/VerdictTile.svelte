<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvActivity } from '../model.js';
	import { activityLabel, tvText, verdictWord } from '../text.js';
	import Strip from './Strip.svelte';
	import VerdictIcon from './VerdictIcon.svelte';

	// The verdict of one activity as a tile of the dial: the word first, then its slot and the day hour by hour.
	let { activity, lang }: { activity: TvActivity | undefined; lang: Lang } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{activity ? activityLabel(lang, activity.id) : ''}</div>
	{#if activity}
		<div class="tv-verdict tv-v-{activity.verdict ?? 'null'}">
			<VerdictIcon verdict={activity.verdict} size={8.4} />
			<span class="tv-display tv-verdict-word tv-t70">{verdictWord(lang, activity.verdict)}</span>
		</div>
		<div class="tv-line">
			{#if !activity.available}
				<span class="tv-mut">{tvText(lang, 'cannotJudge')}</span>
			{:else}
				{tvText(lang, 'slot')} <b class="tv-mono">{activity.slot ?? tvText(lang, 'noSlot')}</b>
			{/if}
		</div>
		{#if activity.reason}<div class="tv-sub tv-mut">{activity.reason}</div>{/if}
		<div class="tv-grow"></div>
		<div class="tv-strip-box tv-strip-small"><Strip {activity} /></div>
	{:else}
		<div class="tv-nodata">–<span>{tvText(lang, 'noData')}</span></div>
	{/if}
</div>
