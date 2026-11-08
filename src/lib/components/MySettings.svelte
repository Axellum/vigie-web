<script lang="ts">
	// The settings of the account that show on "My page": the units of the figures and the language of the site and of
	// the alerts. Kept in the account, so that every device reads them the same.
	import { enhance } from '$app/forms';
	import { translator, type Key, type Lang } from '#lib/i18n.js';
	import { HEIGHT_UNITS, TEMPERATURE_UNITS, WIND_UNITS } from '#lib/prefs.js';
	import { speedLabel, type Units } from '#lib/units.js';

	let { lang, units }: { lang: Lang; units: Units } = $props();
	const tr = $derived(translator(lang));
	let saved = $state(false);
	let saving = $state(false);
</script>

<details class="card settings">
	<summary>{tr('me.settings')}</summary>
	<form
		method="POST"
		action="?/prefs"
		class="form"
		use:enhance={() => {
			saving = true;
			saved = false;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
				saved = true;
			};
		}}
	>
		<p class="muted small">{tr('me.settingsHelp')}</p>
		<label class="form-field">
			<span>{tr('me.lang')}</span>
			<select class="input" name="lang">
				<option value="fr" selected={lang === 'fr'}>Français</option>
				<option value="en" selected={lang === 'en'}>English</option>
			</select>
		</label>
		<label class="form-field">
			<span>{tr('me.unitTemperature')}</span>
			<select class="input" name="temperature">
				{#each TEMPERATURE_UNITS as u (u)}
					<option value={u} selected={units.temperature === u}>{tr(`unit.${u}` as Key)}</option>
				{/each}
			</select>
		</label>
		<label class="form-field">
			<span>{tr('me.unitWind')}</span>
			<select class="input" name="wind">
				{#each WIND_UNITS as u (u)}
					<option value={u} selected={units.wind === u}>{speedLabel(lang, u)}</option>
				{/each}
			</select>
		</label>
		<label class="form-field">
			<span>{tr('me.unitHeight')}</span>
			<select class="input" name="height">
				{#each HEIGHT_UNITS as u (u)}
					<option value={u} selected={units.height === u}>{tr(`unit.${u}` as Key)}</option>
				{/each}
			</select>
		</label>
		<p class="btn-row">
			<button type="submit" class="btn" disabled={saving}>{tr('me.settingsSave')}</button>
		</p>
		<p class="muted small" role="status">{saved ? tr('me.settingsSaved') : ''}</p>
	</form>
</details>

<style>
	.settings summary {
		cursor: pointer;
		font-weight: 600;
	}
	.settings .form {
		margin-top: 12px;
		max-width: 420px;
	}
</style>
