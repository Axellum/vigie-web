<script lang="ts">
	import '#lib/tv/tv.css';
	import { tvText } from '#lib/tv/text.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
	const theme = $derived(data.params.theme === 'night' ? 'night' : 'day');
</script>

<svelte:head>
	<title>Vigie · TV</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		html {
			font-size: 0.52083vw;
		}
	</style>
	<script src="/tv/screen.js?v={data.build}" defer></script>
</svelte:head>

<div class="tv-page" data-theme={theme}>
	<div
		class="tv-wrap"
		id="tv-root"
		data-state={data.mode === 'pair' ? 'pair' : 'empty'}
		data-pair-poll={data.mode === 'pair' ? '/tv/pair/poll' : undefined}
		data-pair-query={data.querySuffix}
		data-pair-expired={tvText(lang, 'pair.expired')}
	>
		<div class="tv-frame" id="tv-frame">
			<div class="tv-inner">
				<div class="tv-msg">
					<div class="tv-card tv-msg-card">
						{#if data.mode === 'pair' && data.code}
							<div class="tv-pair-wrap">
								<div class="tv-pair-main">
									<div class="tv-cap">{tvText(lang, 'pair.title')}</div>
									<p class="tv-t34 tv-mut">{tvText(lang, 'pair.lead')}</p>
									<div class="tv-mono tv-pair-code" id="tv-pair-code">{data.code}</div>
									<p class="tv-t30 tv-mut" id="tv-pair-status" role="status">
										{tvText(lang, 'pair.waiting')}
									</p>
								</div>
								{#if data.qr}
									<div class="tv-qr-row">
										<svg
											class="tv-qr"
											viewBox="0 0 {data.qr.size} {data.qr.size}"
											role="img"
											aria-label={data.accountUrl}
										>
											<rect width={data.qr.size} height={data.qr.size} fill="#fff" />
											<path d={data.qr.path} fill="#000" />
										</svg>
									</div>
								{/if}
							</div>
						{:else}
							<h1 class="tv-display tv-t70">{tvText(lang, 'pair.title')}</h1>
							<p class="tv-t34 tv-mut">{tvText(lang, 'pair.disabled')}</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
