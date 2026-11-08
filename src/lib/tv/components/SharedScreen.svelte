<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import type { TvParams } from '../params.js';
	import { cardLabel, clockAt, dateAt, type SharedScreen } from '../shared.js';
	import { tvText } from '../text.js';
	import AirTile from './AirTile.svelte';
	import RainTile from './RainTile.svelte';
	import SkyTile from './SkyTile.svelte';
	import SwellTile from './SwellTile.svelte';
	import TideTile from './TideTile.svelte';
	import WaterTile from './WaterTile.svelte';
	import WindTile from './WindTile.svelte';

	// The screen of a personal page: its title and the clock above, one panel for each card that takes its turn in the middle, the
	// credits under. The root carries the same `data-` attributes as the screen of a spot (`Screen.svelte`), so the script of the
	// screen (screen.es5.js) runs it unchanged: the clock, the day and night, the turns, the new reading and the offline banner. Without
	// the clock of a place (`data-offset` absent) the script leaves the clock empty. Nothing here is a link: a television has nothing to
	// click, and the address of the page must not leave it.
	let {
		screen,
		params,
		lang,
		build,
		freshLabel
	}: {
		screen: SharedScreen;
		params: TvParams;
		lang: Lang;
		build: string;
		/** When the data were read, as a time of day at the place: `11:06`. */
		freshLabel: string | null;
	} = $props();

	const clock = $derived(screen.offsetS == null ? '' : clockAt(screen.now, screen.offsetS));
	const date = $derived(screen.offsetS == null ? '' : dateAt(lang, screen.now, screen.offsetS));
</script>

<div
	class="tv-root tv-{screen.theme}"
	id="tv-root"
	data-state="screen"
	data-build={build}
	data-now={screen.now}
	data-offset={screen.offsetS ?? undefined}
	data-fresh={screen.fresh ?? ''}
	data-theme-mode={params.theme}
	data-windows={screen.windows.map((w) => w.join('-')).join(',')}
	data-seconds={params.seconds}
	data-refresh={params.refreshSeconds}
	data-reload={params.reloadHours}
	data-lang={lang}
	data-offline={tvText(lang, 'offline', { time: freshLabel ?? '–' })}
>
	<div class="tv-frame">
		<div class="tv-shift" id="tv-shift">
			<div class="tv-safe">
				<header class="tv-head">
					<div class="tv-head-title">
						<div class="tv-display tv-place tv-place-page">{screen.title}</div>
					</div>
					<div class="tv-mid">
						{#if screen.panels.length > 1}
							<div class="tv-dots" id="tv-dots" aria-hidden="true">
								{#each screen.panels as panel, i (panel.id)}<span class="tv-dot{i === 0 ? ' tv-dot-on' : ''}"
									></span>{/each}
							</div>
						{/if}
					</div>
					<div class="tv-when">
						<div class="tv-mono tv-clock" id="tv-clock">{clock}</div>
						<div class="tv-mut tv-t30" id="tv-date">{date}</div>
					</div>
				</header>
				<main class="tv-panels" id="tv-panels">
					{#each screen.panels as panel, i (panel.id)}
						<section class="tv-panel{i === 0 ? ' tv-on' : ''}" data-panel={panel.id}>
							<div class="tv-shared-head">
								<span class="tv-display tv-shared-place">{panel.place}</span>
								<span class="tv-mut tv-t38">{cardLabel(lang, panel.card)}</span>
							</div>
							<div class="tv-cols">
								{#if panel.card === 'weather'}
									<div class="tv-col"><SkyTile sky={panel.sky} {lang} water={false} /></div>
									<div class="tv-col"><WindTile wind={panel.wind} {lang} /></div>
									<div class="tv-col"><RainTile rain={panel.rain} {lang} /></div>
								{:else if panel.card === 'sea'}
									<div class="tv-col"><SwellTile swell={panel.swell} {lang} waves={panel.waves} /></div>
									<div class="tv-col"><WaterTile waterC={panel.waterC} {lang} /></div>
									<div class="tv-col"><WindTile wind={panel.wind} {lang} /></div>
								{:else if panel.card === 'tide'}
									<div class="tv-col"><TideTile tide={panel.tide} {lang} /></div>
								{:else}
									<div class="tv-col"><AirTile air={panel.air} {lang} /></div>
								{/if}
							</div>
						</section>
					{/each}
				</main>
				<footer class="tv-foot">
					<div class="tv-foot-text">
						<b>Vigie</b> · {tvText(lang, 'free')} · {tvText(lang, 'disclaimer')}<br />
						{screen.credit}
					</div>
				</footer>
			</div>
		</div>
		<div
			class="tv-banner{screen.stale ? ' tv-banner-on' : ''}"
			id="tv-banner"
			role="status"
			data-stale={tvText(lang, 'staleData', { time: freshLabel ?? '–' })}
		>
			{screen.stale ? tvText(lang, 'staleData', { time: freshLabel ?? '–' }) : ''}
		</div>
	</div>
</div>
