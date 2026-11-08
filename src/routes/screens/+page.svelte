<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { PANEL_CHOICES } from '#lib/tv/address.js';
	import { TV_PRESETS } from '#lib/tv/params.js';
	import { setupText, type SetupKey } from '#lib/tv/setupText.js';
	import type { PageProps } from './$types';

	// Sets a television screen up: the choices are sent in the address of this page (a form read with GET, so that the page works
	// without a script too), and the page writes the address of the screen they make. Nothing is kept.
	let { data }: PageProps = $props();
	const lang = $derived(data.lang);
	const text = (key: SetupKey) => setupText(lang, key);
	const params = $derived(data.setup.params);

	let copied = $state(false);
	async function copy() {
		const field = document.getElementById('screen-address') as HTMLInputElement | null;
		try {
			await navigator.clipboard.writeText(data.address ?? '');
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No clipboard (an address that is not secure, an old browser): select the address so that the person can copy it.
			field?.select();
		}
	}
</script>

<Seo title={text('title')} description={text('description')} />

<div class="page screens">
	<h1>{text('title')}</h1>
	<p class="lead">{text('intro')}</p>

	<div class="grid">
		<form
			method="get"
			action="/screens"
			class="card form"
			data-sveltekit-keepfocus
			data-sveltekit-noscroll
			onchange={(e) => e.currentTarget.requestSubmit()}
		>
			<h2>{text('formTitle')}</h2>

			<div class="form-field">
				<label for="spot">{text('spot')}</label>
				{#if data.spots.length}
					<select id="spot" name="spot" class="input">
						<option value="" selected={!params.spot}>{text('spotChoose')}</option>
						{#each data.spots as spot (spot.id)}
							<option value={spot.id} selected={spot.id === params.spot}>{spot.label}</option>
						{/each}
					</select>
				{:else}
					<input id="spot" name="spot" class="input" value={params.spot ?? ''} autocomplete="off" />
					<span class="help">{text('spotsDown')}</span>
				{/if}
			</div>

			<fieldset class="form-field">
				<legend>{text('preset')}</legend>
				{#each TV_PRESETS as preset (preset)}
					<label class="choice">
						<input type="radio" name="preset" value={preset} checked={params.preset === preset} />
						<span><b>{text(preset)}</b> <span class="help">{text(`${preset}Help` as SetupKey)}</span></span>
					</label>
				{/each}
			</fieldset>

			<div class="form-field">
				<label for="panels">{text('panels')}</label>
				<select id="panels" name="panels" class="input">
					{#each PANEL_CHOICES as choice (choice)}
						<option value={choice} selected={data.panels === choice}
							>{text(`panels.${choice}` as SetupKey)}</option
						>
					{/each}
				</select>
				<span class="help">{text('panelsHelp')}</span>
			</div>

			<div class="form-field">
				<label for="d">{text('seconds')}</label>
				<input id="d" name="d" type="number" min="5" max="300" class="input short" value={params.seconds} />
				<span class="help">{text('secondsHelp')}</span>
			</div>

			<fieldset class="form-field">
				<legend>{text('theme')}</legend>
				{#each ['auto', 'day', 'night'] as theme (theme)}
					<label class="choice">
						<input type="radio" name="theme" value={theme} checked={params.theme === theme} />
						<span>{text(`theme.${theme}` as SetupKey)}</span>
					</label>
				{/each}
				<span class="help">{text('themeHelp')}</span>
			</fieldset>

			<fieldset class="form-field">
				<legend>{text('lang')}</legend>
				<label class="choice">
					<input type="radio" name="tvlang" value="fr" checked={data.setup.lang === 'fr'} />
					<span>Français</span>
				</label>
				<label class="choice">
					<input type="radio" name="tvlang" value="en" checked={data.setup.lang === 'en'} />
					<span>English</span>
				</label>
				<span class="help">{text('langHelp')}</span>
			</fieldset>

			<details class="form-field">
				<summary>{text('advanced')}</summary>
				<div class="form-field">
					<label for="r">{text('refresh')}</label>
					<input
						id="r"
						name="r"
						type="number"
						min="60"
						max="3600"
						class="input short"
						value={params.refreshSeconds}
					/>
					<span class="help">{text('refreshHelp')}</span>
				</div>
				<div class="form-field">
					<label for="reload">{text('reload')}</label>
					<input
						id="reload"
						name="reload"
						type="number"
						min="1"
						max="48"
						class="input short"
						value={params.reloadHours}
					/>
					<span class="help">{text('reloadHelp')}</span>
				</div>
			</details>

			<button class="btn" type="submit">{text('apply')}</button>
		</form>

		<div class="side">
			<section class="card" aria-live="polite" id="result">
				<h2>{text('resultTitle')}</h2>
				{#if data.address}
					<input
						id="screen-address"
						class="input addr"
						readonly
						value={data.address}
						aria-label={text('resultTitle')}
					/>
					<div class="btn-row">
						<button class="btn" type="button" onclick={copy}>{copied ? text('copied') : text('copy')}</button>
						<a class="btn quiet" href={data.path} target="_blank" rel="noopener">{text('open')}</a>
					</div>
				{:else}
					<p class="help">{text('resultEmpty')}</p>
				{/if}
			</section>

			<section class="card">
				<h2>{text('onTvTitle')}</h2>
				<ul>
					<li>{text('onTv1')}</li>
					<li>{text('onTv2')}</li>
					<li>{text('onTv3')}</li>
				</ul>
			</section>

			<section class="card">
				<h2>{text('aboutTitle')}</h2>
				<p>{text('about1')}</p>
				<p>
					{text('about2')}
					<a href="https://github.com/Axellum/vigie-web/blob/main/docs/tv.md">{text('docs')}</a>
				</p>
			</section>
		</div>
	</div>
</div>

<style>
	.lead {
		margin: 0;
		max-width: 62ch;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 1.05rem;
	}
	section p {
		margin: 0 0 8px;
	}
	section p:last-child {
		margin-bottom: 0;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 4px;
		font-weight: 600;
	}
	label {
		font-weight: 600;
	}
	.choice {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 4px 0;
		font-weight: 400;
	}
	.choice input {
		margin-top: 4px;
	}
	.help {
		color: var(--muted);
		font-size: 13px;
		font-weight: 400;
	}
	.short {
		max-width: 8rem;
	}
	.addr {
		max-width: none;
		font-family: var(--font-data);
		font-size: 13px;
		margin-bottom: 8px;
	}
	summary {
		cursor: pointer;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding-left: 1.2em;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
</style>
