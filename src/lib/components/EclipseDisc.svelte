<script lang="ts">
	// The Sun and the Moon seen from the place, from the first contact to the last, as the API computed them (north
	// up, east to the left as in the sky). A slider chooses the instant; "Play" runs the eclipse in a few seconds.
	import { onDestroy } from 'svelte';
	import { clock, eclipseText, frameAt, type EclipseFrame } from '#lib/eclipse.js';
	import type { Lang } from '#lib/i18n.js';

	let { lang, frames }: { lang: Lang; frames: EclipseFrame[] } = $props();

	const first = $derived(frames[0]?.time ?? 0);
	const last = $derived(frames[frames.length - 1]?.time ?? 0);
	// The instant shown: the peak (the frame that hides the most, the Moon nearest the centre) until the reader moves it.
	const peak = $derived(
		frames.reduce((a, b) =>
			b.obscuration > a.obscuration ||
			(b.obscuration === a.obscuration && Math.hypot(b.east, b.north) < Math.hypot(a.east, a.north))
				? b
				: a
		)?.time ?? 0
	);
	let chosen = $state<number | null>(null);
	const time = $derived(chosen ?? peak);
	const frame = $derived(frameAt(frames, time));
	const total = $derived((frame?.obscuration ?? 0) >= 0.9999);

	let timer: ReturnType<typeof setInterval> | null = null;
	let playing = $state(false);
	const STEPS = 240; // about eight seconds for the whole eclipse

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
		playing = false;
	}

	function play() {
		if (playing) return stop();
		if (time >= last) chosen = first;
		playing = true;
		timer = setInterval(() => {
			const next = (chosen ?? first) + (last - first) / STEPS;
			if (next >= last) {
				chosen = last;
				stop();
			} else chosen = next;
		}, 33);
	}

	onDestroy(stop);
</script>

{#if frame}
	<div class="disc">
		<svg viewBox="-3 -2.2 6 4.4" role="img" aria-label={eclipseText(lang, 'disc')}>
			<defs>
				<radialGradient id="corona">
					<stop offset="0.5" stop-color="#eef2ff" stop-opacity="0.9" />
					<stop offset="1" stop-color="#eef2ff" stop-opacity="0" />
				</radialGradient>
			</defs>
			{#if total}<circle r="1.7" fill="url(#corona)" opacity="0.75" />{/if}
			<circle r="1" class="sun" />
			<circle cx={-frame.east} cy={-frame.north} r={frame.moonRadius} class="moon" />
		</svg>
		<p class="caption">
			<span class="data">{clock(lang, time, true)}</span>
			<span>{Math.round(frame.obscuration * 100)} % {eclipseText(lang, 'hidden')}</span>
		</p>
		<div class="controls">
			<button type="button" onclick={play}>{eclipseText(lang, playing ? 'pause' : 'play')}</button>
			<input
				type="range"
				min={first}
				max={last}
				step="1"
				value={time}
				aria-label={eclipseText(lang, 'at')}
				oninput={(e) => {
					stop();
					chosen = Number((e.currentTarget as HTMLInputElement).value);
				}}
			/>
		</div>
		<p class="muted small">{eclipseText(lang, 'discNote')}</p>
	</div>
{/if}

<style>
	.disc {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	svg {
		width: 100%;
		max-width: 320px;
		height: auto;
		background: #0b1026;
		border-radius: var(--radius);
	}
	.sun {
		fill: #f6c544;
	}
	.moon {
		fill: #0b1026;
		stroke: #262b45;
		stroke-width: 0.01;
	}
	.caption {
		display: flex;
		gap: 12px;
		font-size: 14px;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 320px;
	}
	.controls input {
		flex: 1;
		min-width: 0;
	}
</style>
