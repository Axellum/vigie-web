<script lang="ts">
	// The sky of a weather code as a small drawing of the family's charter: a sun (or a moon at night), clouds, drops, flakes.
	import type { SkyKind } from '../model';

	let { kind, night = false, size = 40 }: { kind: SkyKind; night?: boolean; size?: number } = $props();

	const SUN = '#FFC83D';
	const MOON = '#F4E7B0';
	const CLOUD = '#E6EDF5';
	const DARK = '#A9B7CB';
	const WATER = '#62BCFF';
	const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
	const wet = $derived(kind === 'drizzle' || kind === 'rain' || kind === 'showers' || kind === 'storm');
	const cloudy = $derived(kind !== 'clear');
	const lowCloud = $derived(wet || kind === 'snow');
	const drops = $derived(
		kind === 'drizzle'
			? [
					[38, 72],
					[60, 72]
				]
			: kind === 'showers' || kind === 'storm'
				? [
						[30, 70],
						[48, 74],
						[66, 70]
					]
				: [
						[34, 70],
						[52, 74],
						[70, 70]
					]
	);
</script>

<svg class="sky" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
	{#if kind === 'clear' || kind === 'partly'}
		{#if night}
			<path
				d="M52 16 A26 26 0 1 0 80 52 A20 20 0 1 1 52 16 Z"
				fill={MOON}
				transform={kind === 'partly' ? 'translate(-12 -6)' : ''}
			/>
		{:else}
			<g transform={kind === 'partly' ? 'translate(-12 -12)' : ''}>
				<circle cx="50" cy="50" r={kind === 'partly' ? 15 : 19} fill={SUN} />
				{#each rays as a (a)}
					<line
						x1={50 + Math.cos(a) * (kind === 'partly' ? 22 : 27)}
						y1={50 + Math.sin(a) * (kind === 'partly' ? 22 : 27)}
						x2={50 + Math.cos(a) * (kind === 'partly' ? 31 : 38)}
						y2={50 + Math.sin(a) * (kind === 'partly' ? 31 : 38)}
						stroke={SUN}
						stroke-width="5"
						stroke-linecap="round"
					/>
				{/each}
			</g>
		{/if}
	{/if}
	{#if cloudy}
		<g
			fill={lowCloud || kind === 'cloudy' || kind === 'fog' ? DARK : CLOUD}
			transform={lowCloud ? 'translate(0 -12)' : kind === 'partly' ? 'translate(6 8)' : ''}
		>
			<circle cx="36" cy="58" r="16" />
			<circle cx="55" cy="48" r="22" />
			<circle cx="74" cy="60" r="14" />
			<rect x="22" y="58" width="64" height="22" rx="11" />
		</g>
	{/if}
	{#if kind === 'fog'}
		{#each [84, 93] as y (y)}
			<line x1="18" y1={y} x2="82" y2={y} stroke={CLOUD} stroke-width="5" stroke-linecap="round" />
		{/each}
	{/if}
	{#if wet}
		{#each drops as [x, y] (x)}
			<line x1={x} y1={y} x2={x - 6} y2={y + 16} stroke={WATER} stroke-width="6" stroke-linecap="round" />
		{/each}
	{/if}
	{#if kind === 'storm'}
		<polygon points="54,62 42,82 52,82 46,98 64,74 54,74 60,62" fill={SUN} />
	{/if}
	{#if kind === 'snow'}
		{#each [[34, 80], [52, 86], [70, 80]] as [x, y] (x)}
			<circle cx={x} cy={y} r="5" fill={CLOUD} />
		{/each}
	{/if}
</svg>

<style>
	.sky {
		flex: none;
		display: block;
	}
</style>
