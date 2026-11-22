<script lang="ts" module>
	// The small line pictograms of the family's common charter, on a 24 grid, drawn with the current colour.
	export const GLYPHS = {
		pin: '<path d="M12 21 s-7 -6.5 -7 -11 a7 7 0 0 1 14 0 c0 4.5 -7 11 -7 11 Z"/><circle cx="12" cy="10" r="2.5"/>',
		umbrella: '<path d="M3 12 a9 9 0 0 1 18 0 Z"/><path d="M12 12 v6 a2 2 0 0 1 -4 0"/>',
		warning:
			'<path d="M12 3 L22 20 H2 Z"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6"/>',
		check: '<circle cx="12" cy="12" r="9"/><polyline points="8,12.5 11,15.5 16.5,9"/>',
		wind: '<path d="M3 8 h10 a3 3 0 1 0 -3 -3"/><path d="M3 13 h15 a3 3 0 1 1 -3 3"/><path d="M3 18 h6"/>',
		waves:
			'<path d="M3 8 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0"/><path d="M3 13 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0"/><path d="M3 18 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0"/>',
		tide: '<path d="M3 15 q2.25 -3 4.5 0 t4.5 0 t4.5 0 t4.5 0"/><line x1="12" y1="3" x2="12" y2="11"/><polyline points="9,6 12,3 15,6"/>',
		surf: '<ellipse cx="12" cy="12" rx="3.6" ry="10" transform="rotate(35 12 12)"/><line x1="7" y1="7" x2="17" y2="17"/>',
		boat: '<path d="M12 3 V17"/><path d="M12 3 L19 14 H12"/><path d="M10 6 L5 14 H10"/><path d="M3 18 H21 L19 21 H5 Z"/>',
		kite: '<polygon points="12,2 19,10 12,22 5,10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="5" y1="10" x2="19" y2="10"/>',
		shore_fishing: '<path d="M5 9 h14 l-1.6 11 H6.6 Z"/><path d="M8 9 a4 4 0 0 1 8 0"/>'
	} as const;
	export type GlyphName = keyof typeof GLYPHS;
</script>

<script lang="ts">
	let {
		name,
		size = 16,
		colour = 'currentColor',
		weight = 2
	}: { name: GlyphName; size?: number; colour?: string; weight?: number } = $props();
</script>

<svg
	class="glyph"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={colour}
	stroke-width={weight}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true">{@html GLYPHS[name]}</svg
>

<style>
	.glyph {
		flex: none;
		display: block;
	}
</style>
