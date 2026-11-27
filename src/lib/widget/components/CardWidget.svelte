<script lang="ts">
	// The medium and large widgets of a place: the home page of the Home Assistant card (`<vigie-card>`, loaded from
	// `static/ha-card/`), drawn smaller to fill the widget (cardFit.ts). Medium: now, the rain of the hour, the warning, and the
	// next 24 hours or the next days as chosen in the app (`fc`). Large: everything, the facts of now and both blocks. The page plays
	// the part of Home Assistant as for the home face (HomeCard.svelte): the card asks its data with `callWS` and gets the latest
	// the page read; the same configuration set again tells it to read again.
	import { onMount } from 'svelte';
	import type { Lang } from '../../i18n';
	import { CARD_BACKGROUND, cardFrame, cardStyle, type CardSize } from '../cardFit';
	import { HA_CARD_URL } from '../haCard';
	import { fakeHass, type CardData } from '../homeCard';
	import type { WidgetForecast, WidgetFrame, WidgetTheme } from '../params';

	type Card = HTMLElement & { setConfig(config: object): void; hass: unknown };

	let {
		name,
		lang,
		theme,
		data,
		size,
		forecast,
		frame
	}: {
		name: string;
		lang: Lang;
		theme: WidgetTheme;
		data: CardData | null;
		size: CardSize;
		forecast: WidgetForecast;
		frame: WidgetFrame | null;
	} = $props();

	let host: HTMLDivElement;
	let width = $state(0),
		height = $state(0);
	let card = $state<Card | null>(null);
	let sheet = $state<HTMLStyleElement | null>(null);
	let failed = $state(false);
	const config = $derived({ pages: ['home'], name, spot: 'none', idle: 'none' });
	const fitted = $derived(width > 0 && height > 0 ? cardFrame(size, forecast, frame, width, height) : null);
	const style = $derived(fitted ? cardStyle(fitted, size, forecast, theme) : '');

	onMount(() => {
		let gone = false;
		import(/* @vite-ignore */ HA_CARD_URL)
			.then(() => customElements.whenDefined('vigie-card'))
			.then(() => {
				if (gone) return;
				const el = document.createElement('vigie-card') as Card;
				// The first configuration makes its shadow root, where the widget's style goes.
				el.setConfig(config);
				const own = document.createElement('style');
				el.shadowRoot?.append(own);
				host.append(el);
				sheet = own;
				card = el;
			})
			.catch(() => (failed = true));
		return () => {
			gone = true;
			card?.remove();
		};
	});

	// Its language and its colours; `hass` first set, it reads its data.
	$effect(() => {
		if (card) card.hass = fakeHass(lang, theme !== 'light', () => data);
	});
	// New data, another name, size or choice of the app: the style first, then the card draws and fits its page again.
	$effect(() => {
		void data;
		if (!card || !sheet) return;
		sheet.textContent = style;
		card.setConfig(config);
	});
</script>

<div
	class="frame"
	bind:clientWidth={width}
	bind:clientHeight={height}
	style:background={CARD_BACKGROUND[theme].page}
	data-card={card ? 'yes' : 'no'}
>
	<div
		class="host"
		bind:this={host}
		style:width={fitted ? `${fitted.width}px` : undefined}
		style:left={fitted ? `${fitted.left}px` : undefined}
		style:transform={fitted ? `scale(${fitted.scale})` : undefined}
	></div>
	{#if failed}
		<p class="failed">{lang === 'fr' ? 'La carte ne s’est pas chargée.' : 'The card did not load.'}</p>
	{/if}
</div>

<style>
	/* Home Assistant's surroundings of a card, as for the home face: its font of 14 px with lines of 1.6. The card is drawn at its
	   own size and scaled down from the top left corner: its own measures (the fit of its home page) stay the ones it knows. */
	.frame {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.host {
		position: absolute;
		top: 0;
		transform-origin: 0 0;
		font-family: Roboto, 'Segoe UI', system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.6;
	}
	.host :global(vigie-card) {
		display: block;
	}
	.failed {
		margin: 24px 16px;
		color: #a3b1c0;
	}
</style>
