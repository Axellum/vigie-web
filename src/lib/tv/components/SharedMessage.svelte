<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import { tvText } from '../text.js';

	// What the screen of a personal page says when it has nothing to draw: a page without a card a screen can show (or made of the
	// home alone, which no screen ever shows). Not an error: the owner may be editing the page, so the script reads it again by
	// itself (`data-state="unavailable"` is the state it retries from).
	let { lang, build, retrySeconds }: { lang: Lang; build: string; retrySeconds: number } = $props();
</script>

<div
	class="tv-root tv-night"
	id="tv-root"
	data-state="unavailable"
	data-build={build}
	data-retry={retrySeconds}
	data-reload="12"
	data-lang={lang}
>
	<div class="tv-frame">
		<div class="tv-shift" id="tv-shift">
			<div class="tv-safe">
				<div class="tv-message">
					<div class="tv-display tv-t90">{tvText(lang, 'emptyTitle')}</div>
					<div class="tv-mut tv-t44 tv-mt24">{tvText(lang, 'emptyHelp')}</div>
				</div>
				<footer class="tv-foot">
					<div class="tv-foot-text"><b>Vigie</b> · {tvText(lang, 'free')} · {tvText(lang, 'disclaimer')}</div>
				</footer>
			</div>
		</div>
	</div>
</div>
