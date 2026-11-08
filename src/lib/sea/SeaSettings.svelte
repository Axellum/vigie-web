<script lang="ts">
	// "My activity" settings, kept in this browser only: the unit of the wind and the wind range of the kite. A range typed in
	// the unit chosen goes to the API in whole knots; the sea pages then show the verdicts for that range. Without the script
	// the section is not shown (the page itself works without it).
	import { goto } from '$app/navigation';
	import { number } from '#lib/format.js';
	import type { Lang } from '#lib/i18n.js';
	import { MAX_WIND_KN, validRange, type SeaChoice, type WindUnit } from './choice.js';
	import { SLUGS } from './overview.js';
	import { seaText } from './text.js';
	import { fromKn, toKn, unitLabel } from './units.js';

	let {
		lang,
		choice,
		applied,
		onchange
	}: {
		lang: Lang;
		choice: SeaChoice;
		/** The wind range of the kite the verdicts on the page stand on (knots), when the API said. */
		applied: { min: number; max: number } | null;
		onchange: (change: Partial<SeaChoice>) => void;
	} = $props();

	const t = (key: string, vars: Record<string, string | number> = {}) => seaText(lang, key, vars);
	// Whole numbers: the API takes whole knots, so a tenth of a km/h would promise a precision it does not keep.
	const shown = (kn: number) => String(Math.round(fromKn(kn, choice.unit)));

	// The fields follow the range in force (the one chosen, else the API's) and the unit.
	let from = $state('');
	let to = $state('');
	let bad = $state(false);
	$effect(() => {
		const range = choice.wind ?? applied;
		from = range ? shown(range.min) : '';
		to = range ? shown(range.max) : '';
	});

	function apply(event: SubmitEvent) {
		event.preventDefault();
		const min = Math.round(toKn(Number(from.replace(',', '.')), choice.unit));
		const max = Math.round(toKn(Number(to.replace(',', '.')), choice.unit));
		const wind = validRange(min, max);
		bad = wind == null;
		if (!wind) return;
		onchange({ wind, activity: 'kite' });
		void goto(`/sea/${SLUGS.kite}?min=${wind.min}&max=${wind.max}`, { reset: false });
	}

	function reset() {
		bad = false;
		onchange({ wind: null });
		void goto(`/sea/${SLUGS.kite}`, { reset: false });
	}

	const maxShown = $derived(number(lang, fromKn(MAX_WIND_KN, choice.unit), 0));
	const units: WindUnit[] = ['kn', 'kmh'];
</script>

<details class="settings">
	<summary>{t('settings')}</summary>
	<p class="muted small">{t('settingsNote')}</p>

	<fieldset>
		<legend>{t('unit')}</legend>
		{#each units as u (u)}
			<label
				><input
					type="radio"
					name="wind-unit"
					value={u}
					checked={choice.unit === u}
					onchange={() => onchange({ unit: u })}
				/>
				{unitLabel(lang, u)}</label
			>
		{/each}
	</fieldset>

	<form onsubmit={apply}>
		<fieldset>
			<legend>{t('windRange')}</legend>
			<div class="range">
				<label
					>{t('windFrom')}
					<input
						class="input num"
						inputmode="decimal"
						bind:value={from}
						aria-describedby="wind-help"
						required
					/></label
				>
				<label
					>{t('windTo')}
					<input
						class="input num"
						inputmode="decimal"
						bind:value={to}
						aria-describedby="wind-help"
						required
					/></label
				>
				<span>{unitLabel(lang, choice.unit)}</span>
			</div>
			<p id="wind-help" class="muted small">
				{t('windHelp', {
					min: number(lang, fromKn(1, choice.unit), 0),
					max: maxShown,
					unit: unitLabel(lang, choice.unit)
				})}
			</p>
			{#if bad}<p class="error small" role="alert">
					{t('windBad', { max: maxShown, unit: unitLabel(lang, choice.unit) })}
				</p>{/if}
			<div class="btn-row">
				<button type="submit" class="btn">{t('windApply')}</button>
				{#if choice.wind}<button type="button" class="btn quiet" onclick={reset}>{t('windReset')}</button
					>{/if}
			</div>
		</fieldset>
	</form>
</details>

<style>
	.settings {
		border-top: 1px solid var(--line);
		padding-top: 10px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--muted);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 10px 0 0;
		min-width: 0;
	}
	legend {
		font-weight: 600;
		padding: 0;
		margin-bottom: 4px;
	}
	fieldset label {
		margin-right: 14px;
	}
	.range {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 12px;
		align-items: center;
	}
	.range label {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
	.num {
		width: 5em;
	}
	p {
		margin: 4px 0;
	}
</style>
