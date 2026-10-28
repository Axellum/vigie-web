<script lang="ts">
	// Map and list of the warnings of one country (or of one of its areas), for the reading pages.
	import { onMount } from 'svelte';
	import type { Feature, FeatureCollection } from 'geojson';
	import { geometryBox, type Box } from '#lib/geo.js';
	import type { Lang } from '#lib/i18n.js';
	import { byLevelThenTime, LEVELS, maxLevel } from '#lib/levels.js';
	import { warningHref, warningRow } from '#lib/rows.js';
	import type { Hazard, Level, WarningsData, WarningSummary } from '#lib/types.js';
	import { goto } from '$app/navigation';
	import MapView, { type Selection } from './MapView.svelte';

	interface Props {
		lang: Lang;
		cc: string;
		warnings: WarningSummary[];
		hazards?: Hazard[];
		frame: Box | null;
		now: number;
	}
	let { lang, cc, warnings, hazards = [], frame, now }: Props = $props();

	let shapes = $state<WarningsData['shapes'] | null>(null);
	onMount(async () => {
		try {
			const response = await fetch(`/data/warnings/${cc}.json`);
			if (response.ok) shapes = ((await response.json()) as WarningsData).shapes;
		} catch {
			shapes = null;
		}
	});

	const ids = $derived(new Set(warnings.map((w) => w.id)));
	const zones = $derived.by((): FeatureCollection => {
		const features: Feature[] = [];
		if (!shapes) return { type: 'FeatureCollection', features };
		const byShape = new Map<string, Level[]>();
		for (const w of warnings) {
			if (!w.shape || !ids.has(w.id)) continue;
			byShape.set(w.shape, [...(byShape.get(w.shape) ?? []), w.level as Level]);
		}
		for (const [shape, levels] of byShape) {
			if (shapes[shape])
				features.push({
					type: 'Feature',
					geometry: shapes[shape],
					properties: { key: shape, level: maxLevel(levels) ?? 'NONE' }
				});
		}
		const rank = (f: Feature) => LEVELS.length - LEVELS.indexOf(f.properties?.level as Level);
		features.sort((a, b) => rank(a) - rank(b));
		return { type: 'FeatureCollection', features };
	});
	const zoneFrame = $derived.by((): Box | null => {
		if (!shapes || warnings.length > 40) return frame;
		let box: Box | null = null;
		for (const w of warnings) {
			const b = w.shape && shapes[w.shape] ? geometryBox(shapes[w.shape]) : null;
			if (!b) continue;
			box = box
				? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]
				: b;
		}
		return box ?? frame;
	});

	function onselect(s: Selection) {
		if (s.kind === 'hazard') {
			goto(`/alert/${encodeURIComponent(s.id)}`);
			return;
		}
		if (s.kind !== 'zone') return;
		const inZone = warnings
			.filter((w) => w.shape === s.key)
			.sort((a, b) => byLevelThenTime(warningRow(a), warningRow(b)));
		if (inZone[0]) goto(warningHref(inZone[0]));
	}
</script>

<div class="map">
	<MapView {lang} {zones} {hazards} frame={zoneFrame} {onselect} />
</div>

<style>
	.map {
		height: min(60vh, 520px);
		min-height: 300px;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
</style>
