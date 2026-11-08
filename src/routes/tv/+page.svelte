<script lang="ts">
	import '#lib/tv/tv.css';
	import Message from '#lib/tv/components/Message.svelte';
	import Screen from '#lib/tv/components/Screen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
</script>

<svelte:head>
	<title>Vigie · TV</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<!-- 1 rem is 1/192 of the width of the screen (10 px at 1920): every size is in rem, so the screen is the same at 1280, 1920 and
	3840. The script of the screen takes the height into account when the screen is not 16:9. -->
	<style>
		html {
			font-size: 0.52083vw;
		}
	</style>
	<script src="/tv/screen.js?v={data.build}" defer></script>
</svelte:head>

{#if data.mode === 'screen' && data.screen}
	<Screen
		screen={data.screen}
		params={data.params}
		{lang}
		qr={data.qr}
		build={data.build}
		freshLabel={data.freshLabel}
	/>
{:else}
	<Message
		kind={data.mode === 'screen' ? 'unavailable' : data.mode}
		params={data.params}
		{lang}
		spots={data.spots}
		build={data.build}
	/>
{/if}
