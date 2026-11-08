<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvParams } from '../params.js';
	import { tvText } from '../text.js';

	// What a screen shows when it has nothing to show yet: no place chosen, an unknown place, or an API that does not answer. Never an
	// error page: a television in a window must stay readable, and the script tries again by itself.
	let {
		kind,
		params,
		lang,
		spots = [],
		build
	}: {
		kind: 'choose' | 'unknown' | 'unavailable';
		params: TvParams;
		lang: Lang;
		spots?: { id: string; name: string; place: string | null }[];
		build: string;
	} = $props();
</script>

<div
	class="tv-root tv-{params.theme === 'night' ? 'night' : 'day'}"
	id="tv-root"
	data-state={kind}
	data-build={build}
	data-retry="60"
	data-reload={params.reloadHours}
	data-lang={lang}
>
	<div class="tv-frame">
		<div class="tv-shift" id="tv-shift">
			<div class="tv-safe">
				<div class="tv-message">
					{#if kind === 'unavailable'}
						<div class="tv-display tv-t90">{tvText(lang, 'unavailable')}</div>
						<div class="tv-mut tv-t44 tv-mt24">{tvText(lang, 'unavailableHelp')}</div>
					{:else}
						<div class="tv-display tv-t90">
							{kind === 'unknown' ? tvText(lang, 'unknownSpot') : tvText(lang, 'chooseTitle')}
						</div>
						<div class="tv-mut tv-t38 tv-mt24">{tvText(lang, 'chooseHelp')}</div>
						{#if spots.length}
							<ul class="tv-spots">
								{#each spots as spot (spot.id)}
									<li>
										<a href="/tv?spot={spot.id}"
											>{spot.place ?? spot.name}{spot.place ? ` · ${spot.name}` : ''}</a
										>
									</li>
								{/each}
							</ul>
						{:else}
							<div class="tv-t38 tv-mt24">{tvText(lang, 'noSpotAtAll')}</div>
						{/if}
					{/if}
				</div>
				<footer class="tv-foot">
					<div class="tv-foot-text"><b>Vigie</b> · {tvText(lang, 'free')} · {tvText(lang, 'disclaimer')}</div>
				</footer>
			</div>
		</div>
	</div>
</div>
