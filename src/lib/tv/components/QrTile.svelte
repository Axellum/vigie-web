<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { Qr } from '../qr.js';
	import { tvText } from '../text.js';

	// The page of the spot on a phone. Dark on white with a quiet zone, large: it is read from a few metres, with the glare of a window.
	let { qr, lang, size = 19 }: { qr: Qr | null; lang: Lang; size?: number } = $props();
</script>

<div class="tv-card tv-tile">
	<div class="tv-cap">{tvText(lang, 'phone')}</div>
	{#if qr}
		<div class="tv-qr-row">
			<svg
				class="tv-qr"
				viewBox="0 0 {qr.size} {qr.size}"
				style="width:{size}rem;height:{size}rem"
				role="img"
				aria-label={tvText(lang, 'fullPage')}
			>
				<rect width={qr.size} height={qr.size} fill="#fff" />
				<path d={qr.path} fill="#000" />
			</svg>
			<div class="tv-t34">
				{tvText(lang, 'phoneLine1')}<br />{tvText(lang, 'phoneLine2')}<br />{tvText(lang, 'phoneLine3')}<br
				/>{tvText(lang, 'phoneLine4')}
			</div>
		</div>
	{/if}
</div>
