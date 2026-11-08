<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { Qr } from '../qr.js';
	import { tvText } from '../text.js';

	// The small QR code in the corner of a panel: the full page of the spot on a phone. It belongs to the panel, so that a panel that
	// shows the large one (a shop's dial) has none.
	let { qr, lang }: { qr: Qr | null; lang: Lang } = $props();
</script>

{#if qr}
	<div class="tv-corner">
		<svg class="tv-qr" viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={tvText(lang, 'fullPage')}>
			<rect width={qr.size} height={qr.size} fill="#fff" />
			<path d={qr.path} fill="#000" />
		</svg>
		<span class="tv-corner-label">{tvText(lang, 'fullPage')}</span>
	</div>
{/if}
