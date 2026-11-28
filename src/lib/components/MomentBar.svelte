<script lang="ts">
	// The bar at the foot of the home map while its "Weather" layer is on: the moment its pills show (now, in 3, 6 and 9 hours, tomorrow
	// at 8 and 14 h at each town's clock, the two days after). One button pressed at a time; on a phone it scrolls sideways.
	import { calendarDay } from '#lib/format.js';
	import { translator, type Lang } from '#lib/i18n.js';
	import type { Moment } from '#lib/townWeather.js';
	import { hourLabel } from '#lib/widget/boardArt.js';

	let {
		lang,
		choices,
		now,
		selected = $bindable(0)
	}: { lang: Lang; choices: Moment[]; now: number; selected?: number } = $props();
	const tr = $derived(translator(lang));

	// The visitor's clock: the hours of the bar are those of the person looking.
	const offset = () => -new Date(now * 1000).getTimezoneOffset() * 60;
	const localDate = (t: number) => new Date((t + offset()) * 1000).toISOString().slice(0, 10);

	function label(m: Moment): string {
		if (m.kind === 'now') return tr('towns.now');
		if (m.kind === 'hour') return hourLabel(lang, m.t, offset());
		if (m.kind === 'local')
			return tr('towns.tomorrowAt', { hour: hourLabel(lang, Date.UTC(2000, 0, 1, m.hour) / 1000, 0) });
		return calendarDay(lang, localDate(now + m.days * 86_400), true);
	}
</script>

<div class="moments" role="group" aria-label={tr('towns.moment')} data-testid="town-moments">
	<span class="lab" aria-hidden="true">{tr('towns.moment')}</span>
	{#each choices as m, i (i)}
		<button type="button" aria-pressed={selected === i} onclick={() => (selected = i)}>{label(m)}</button>
	{/each}
</div>

<style>
	.moments {
		position: absolute;
		left: 10px;
		/* Where the radar's card stands; the page lifts the card over the bar (`--map-foot`). */
		bottom: 34px;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 4px;
		max-width: calc(100% - 20px);
		overflow-x: auto;
		padding: 5px 6px;
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		border: 1px solid var(--line);
		border-radius: 12px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
		scrollbar-width: none;
	}
	.lab {
		flex: none;
		padding: 0 6px 0 4px;
		color: var(--muted);
		font: 600 11px/1 var(--font-body);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	button {
		flex: none;
		padding: 5px 9px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: none;
		color: var(--ink);
		font: 600 12.5px/1 var(--font-body);
		white-space: nowrap;
		cursor: pointer;
	}
	button:hover {
		border-color: var(--line);
	}
	button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--surface);
	}
	@media (max-width: 899px) {
		.lab {
			display: none;
		}
	}
	@media (max-width: 520px) {
		.moments {
			bottom: 54px;
		}
	}
</style>
