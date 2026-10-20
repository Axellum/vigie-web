<script lang="ts">
	// One cell of active fires or one detection, chosen on the map: the figures of NASA FIRMS as the API gave
	// them, and what they are not (an alert, a fire's size, a proof that there is no fire elsewhere).
	import Time from '$lib/components/Time.svelte';
	import { number } from '$lib/format';
	import { tOr, translator, type Lang } from '$lib/i18n';

	let {
		lang,
		lon,
		lat,
		props,
		cellDeg,
		windowHours
	}: {
		lang: Lang;
		lon: number;
		lat: number;
		props: Record<string, unknown>;
		/** The cell of the grid it was counted in; null for a detection. */
		cellDeg: number | null;
		windowHours: number | null;
	} = $props();

	const tr = $derived(translator(lang));
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
	const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
	const SATELLITES: Record<string, string> = { N20: 'NOAA-20', N21: 'NOAA-21', N: 'Suomi NPP' };
	const isCell = $derived(num(props.n) != null);
	const frp = $derived(num(props.frp));
	const confidence = $derived(text(props.c));
	const satellite = $derived(text(props.s));
	const daynight = $derived(text(props.d));
	const pass = $derived(daynight ? tOr(lang, `fires.daynight.${daynight}`, daynight) : null);
	const hours = $derived(windowHours ?? 24);
</script>

<div class="head">
	<p class="eyebrow">{tr('fires.source')}</p>
	<h2>{isCell ? tr('fires.cellTitle', { n: num(props.n) ?? 0 }) : tr('fires.dotTitle')}</h2>
	<p class="muted small data">{lat.toFixed(isCell ? 2 : 4)}, {lon.toFixed(isCell ? 2 : 4)}</p>
</div>
<dl class="facts">
	{#if isCell}
		<dt>{tr('fires.where')}</dt>
		<dd>{tr('fires.cellWhere', { deg: number(lang, cellDeg, 2), h: hours })}</dd>
		<dt>{tr('fires.latest')}</dt>
		<dd><Time {lang} unix={num(props.t)} /></dd>
		<dt>{tr('fires.maxFrp')}</dt>
		<dd class="data">{frp == null ? '–' : `${number(lang, frp)} MW`}</dd>
	{:else}
		<dt>{tr('fires.seen')}</dt>
		<dd>
			<Time {lang} unix={num(props.t)} />{#if pass}{' · '}{pass}{/if}
		</dd>
		<dt>{tr('fires.frp')}</dt>
		<dd class="data">{frp == null ? '–' : `${number(lang, frp)} MW`}</dd>
		<dt>{tr('fires.confidence')}</dt>
		<dd>{confidence ? tOr(lang, `fires.conf.${confidence}`, confidence) : '–'}</dd>
		<dt>{tr('fires.satellite')}</dt>
		<dd>{satellite ? (SATELLITES[satellite] ?? satellite) : '–'} · VIIRS</dd>
	{/if}
</dl>
<p class="note small">{tr('fires.frpHelp')}</p>
<p class="note small">{tr('fires.notAlert')}</p>

<style>
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 6px 14px;
		margin: 0;
	}
	.facts dt {
		color: var(--muted);
	}
	.facts dd {
		margin: 0;
		min-width: 0;
	}
	.note {
		margin: 0;
		color: var(--muted);
	}
</style>
