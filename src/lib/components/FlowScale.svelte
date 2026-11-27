<script lang="ts">
	// The two inks of the forecast wind's trails, each with the strength from which it is drawn, in the unit chosen.
	import { translator, type Lang } from '#lib/i18n.js';
	import type { WindUnit } from '#lib/sea/choice.js';
	import { windValue } from '#lib/wind.js';
	import { FLOW_STRONG_KMH } from '#lib/windField.js';

	let { lang, unit, testid }: { lang: Lang; unit: WindUnit; testid?: string } = $props();
	const tr = $derived(translator(lang));
	const speed = (kmh: number) =>
		tr('wind.speed', {
			value: String(windValue(kmh, unit)),
			unit: tr(unit === 'kn' ? 'wind.kn' : 'wind.kmh')
		});
</script>

<p class="muted small flow-scale" data-testid={testid}>
	<span><i class="ink" aria-hidden="true"></i>{tr('flow.strong', { speed: speed(FLOW_STRONG_KMH[0]) })}</span>
	<span
		><i class="ink stronger" aria-hidden="true"></i>{tr('flow.strong', {
			speed: speed(FLOW_STRONG_KMH[1])
		})}</span
	>
</p>

<style>
	.flow-scale {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin: 0;
	}
	.flow-scale span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.ink {
		width: 16px;
		height: 2px;
		border-radius: 1px;
		background: var(--wind-4);
	}
	.ink.stronger {
		background: var(--wind-5);
	}
</style>
