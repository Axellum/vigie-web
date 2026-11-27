<script lang="ts">
	// The home face: the Home Assistant card of vigie-api (`<vigie-card>`, loaded from `static/ha-card/`), drawn as in Home
	// Assistant with only its home page. The page plays the part of Home Assistant (`fakeHass`): the card asks its data with
	// `callWS` and gets the latest the page read. When they change, the page sets the same configuration again, which is how a
	// Lovelace card is told to read again (`setConfig` asks for the data when it already has `hass`).
	import { onMount } from 'svelte';
	import type { Lang } from '../../i18n';
	import { HA_CARD_URL } from '../haCard';
	import { fakeHass, type CardData } from '../homeCard';

	type Card = HTMLElement & { setConfig(config: object): void; hass: unknown };

	let { name, lang, dark, data }: { name: string; lang: Lang; dark: boolean; data: CardData | null } =
		$props();

	let host: HTMLDivElement;
	let card = $state<Card | null>(null);
	let failed = $state(false);
	const config = $derived({ pages: ['home'], name, spot: 'none', idle: 'none' });

	onMount(() => {
		let gone = false;
		import(/* @vite-ignore */ HA_CARD_URL)
			.then(() => customElements.whenDefined('vigie-card'))
			.then(() => {
				if (gone) return;
				const el = document.createElement('vigie-card') as Card;
				el.setConfig(config);
				host.append(el);
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
		if (card) card.hass = fakeHass(lang, dark, () => data);
	});
	// New data, or another name: read again.
	$effect(() => {
		void data;
		if (card) card.setConfig(config);
	});
</script>

<div class="host" class:dark bind:this={host} data-card={card ? 'yes' : 'no'}>
	{#if failed}
		<p class="failed">{lang === 'fr' ? 'La carte ne s’est pas chargée.' : 'The card did not load.'}</p>
	{/if}
</div>

<style>
	/* Home Assistant's surroundings of a card: its font of 14 px with lines of 1.6 (measured in Home Assistant, the card is
	   drawn for them), and the background of the card, which the card also uses inside its curves. No font is downloaded:
	   Roboto where it is installed, the system's otherwise (Segoe UI on Windows). */
	.host {
		--ha-card-background: #ffffff;
		height: 100%;
		background: var(--ha-card-background);
		font-family: Roboto, 'Segoe UI', system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.6;
		overflow: hidden;
	}
	.host.dark {
		--ha-card-background: #19232e;
	}
	.failed {
		margin: 24px 16px;
		color: #a3b1c0;
	}
</style>
