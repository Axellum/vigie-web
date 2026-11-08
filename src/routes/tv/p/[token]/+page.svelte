<script lang="ts">
	import '#lib/tv/tv.css';
	// The files of the fonts the screen uses (the site's, from its own layout), by the address the build gives them: see the preload below.
	import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
	import sans400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';
	import sans600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url';
	import barlow600 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff2?url';
	import barlow700 from '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff2?url';
	import SharedMessage from '#lib/tv/components/SharedMessage.svelte';
	import SharedScreen from '#lib/tv/components/SharedScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const FONTS = [sans400, sans600, mono500, barlow600, barlow700];
</script>

<svelte:head>
	<!-- The same title for every page: the address is a secret, and so is whatever names the page. -->
	<title>Vigie · TV</title>
	<meta name="robots" content="noindex, nofollow" />
	<!-- The header of the site already says it (securityHeaders.ts), and a browser that knows only the tag follows it too. -->
	<meta name="referrer" content="no-referrer" />
	<!-- But the fonts: the stylesheets of the site are inlined in the page, and the request a font makes for its file then carried the
	address of the page (the secret) in `Referer`, header or not (seen in Chromium; tv-private.spec.ts keeps watching). A font asked for
	by a preload that says no-referrer is not asked for again by the stylesheet. -->
	{#each FONTS as href (href)}
		<link
			rel="preload"
			as="font"
			type="font/woff2"
			crossorigin="anonymous"
			referrerpolicy="no-referrer"
			{href}
		/>
	{/each}
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<!-- 1 rem is 1/192 of the width of the screen, as on /tv (the script of the screen takes the height into account). -->
	<style>
		html {
			font-size: 0.52083vw;
		}
	</style>
	<script src="/tv/screen.js?v={data.build}" defer></script>
</svelte:head>

{#if data.mode === 'screen' && data.screen}
	<SharedScreen
		screen={data.screen}
		params={data.params}
		lang={data.lang}
		build={data.build}
		freshLabel={data.freshLabel}
	/>
{:else}
	<SharedMessage lang={data.lang} build={data.build} retrySeconds={data.params.refreshSeconds} />
{/if}
