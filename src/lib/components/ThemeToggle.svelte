<script lang="ts">
	import { onMount } from 'svelte';
	import { translator, type Lang } from '$lib/i18n';

	let { lang }: { lang: Lang } = $props();
	const tr = $derived(translator(lang));

	type Theme = 'system' | 'light' | 'dark';
	let theme = $state<Theme>('system');

	onMount(() => {
		const current = document.documentElement.dataset.theme;
		theme = current === 'light' || current === 'dark' ? current : 'system';
	});

	function cycle() {
		theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
		const root = document.documentElement;
		try {
			if (theme === 'system') {
				delete root.dataset.theme;
				localStorage.removeItem('vigie-theme');
			} else {
				root.dataset.theme = theme;
				localStorage.setItem('vigie-theme', theme);
			}
		} catch {
			if (theme === 'system') delete root.dataset.theme;
			else root.dataset.theme = theme;
		}
	}
</script>

<button type="button" onclick={cycle} title={tr('theme.toggle')} aria-label={tr('theme.toggle')}>
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
		<path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
	</svg>
	<span>{tr(theme === 'system' ? 'theme.system' : theme === 'light' ? 'theme.light' : 'theme.dark')}</span>
</button>

<style>
	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid var(--line);
		background: var(--surface);
		border-radius: var(--radius);
		padding: 5px 9px;
		font-size: 13px;
		cursor: pointer;
	}
	@media (max-width: 640px) {
		span {
			display: none;
		}
	}
</style>
