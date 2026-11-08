<script lang="ts">
	import type { Lang } from '#lib/i18n.js';
	import { dateLabel, type TvScreen } from '../model.js';
	import type { TvParams } from '../params.js';
	import type { Qr } from '../qr.js';
	import { tvText } from '../text.js';
	import Cadran from './Cadran.svelte';
	import Verdicts from './Verdicts.svelte';

	// The whole screen: the place and the clock above, the panels that take turns in the middle, the credits under. The root carries
	// what the script of the screen needs (the clock, the day and night, the time between two readings) as `data-` attributes, and a
	// reading of the page again gives a new root to put in place of this one.
	let {
		screen,
		params,
		lang,
		qr,
		build,
		freshLabel
	}: {
		screen: TvScreen;
		params: TvParams;
		lang: Lang;
		qr: Qr | null;
		build: string;
		/** When the data were read, as a time of day: `11:06`. */
		freshLabel: string | null;
	} = $props();

	const hh = (t: number, offsetS: number) => {
		const d = new Date((t + offsetS) * 1000);
		return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
	};
	const clock = $derived(hh(screen.now, screen.offsetS));
	const title = $derived(screen.spot.place ?? screen.spot.name);
	const subtitle = $derived(
		[
			screen.spot.place ? screen.spot.name : null,
			screen.vigilance === 'none'
				? tvText(lang, 'vigilanceNone')
				: screen.vigilance === 'in'
					? tvText(lang, 'vigilanceIn')
					: tvText(lang, 'vigilanceUnknown')
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div
	class="tv-root tv-{screen.theme}"
	id="tv-root"
	data-state="screen"
	data-build={build}
	data-now={screen.now}
	data-offset={screen.offsetS}
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
					<div>
						<div class="tv-display tv-place">{title}</div>
						<div class="tv-mut tv-t30 tv-spot">{subtitle}</div>
					</div>
					<div class="tv-when">
						<div class="tv-mono tv-clock" id="tv-clock">{clock}</div>
						<div class="tv-mut tv-t30" id="tv-date">{dateLabel(lang, screen.now)}</div>
					</div>
				</header>
				<main class="tv-panels" id="tv-panels">
					{#each params.panels as panel, i (panel)}
						<section class="tv-panel{i === 0 ? ' tv-on' : ''}" data-panel={panel}>
							{#if panel === 'cadran'}
								<Cadran {screen} preset={params.preset} {lang} {qr} />
							{:else}
								<Verdicts {screen} preset={params.preset} {lang} {qr} />
							{/if}
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
			{#if params.panels.length > 1}
				<div class="tv-dots" id="tv-dots" aria-hidden="true">
					{#each params.panels as panel, i (panel)}<span class="tv-dot{i === 0 ? ' tv-dot-on' : ''}"
						></span>{/each}
				</div>
			{/if}
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
