<script lang="ts">
	import '@fontsource/ibm-plex-sans/latin-400.css';
	import '@fontsource/ibm-plex-sans/latin-500.css';
	import '@fontsource/ibm-plex-sans/latin-600.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '@fontsource/barlow-semi-condensed/latin-600.css';
	import '@fontsource/barlow-semi-condensed/latin-700.css';
	import '../app.css';
	import { page } from '$app/state';
	import { translator } from '$lib/i18n';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { data, children } = $props();
	const tr = $derived(translator(data.lang));
	const other = $derived(data.lang === 'fr' ? 'en' : 'fr');
	const path = $derived(page.url.pathname);
	const isMap = $derived(path === '/');

	const nav = [
		{ href: '/', key: 'nav.map' },
		{ href: '/countries', key: 'nav.countries' },
		{ href: '/sources', key: 'nav.sources' },
		{ href: '/about', key: 'nav.about' }
	] as const;

	function current(href: string): boolean {
		return href === '/'
			? path === '/'
			: path.startsWith(href) || (href === '/countries' && path.startsWith('/country'));
	}
</script>

<a class="skip" href="#main">{tr('nav.skip')}</a>
<div class="shell" class:map-shell={isMap}>
	<header class="top">
		<a class="brand" href="/" aria-label="Vigie">
			<b>Vigie</b><span>{tr('site.tagline')}</span>
		</a>
		<nav aria-label="Vigie">
			{#each nav as item (item.href)}
				<a href={item.href} aria-current={current(item.href) ? 'page' : undefined}>{tr(item.key)}</a>
			{/each}
		</nav>
		<div class="tools">
			<a class="lang" href="?lang={other}" hreflang={other} lang={other} data-sveltekit-reload
				>{tr('lang.switch')}</a
			>
			<ThemeToggle lang={data.lang} />
		</div>
	</header>
	<div class="notice" role="note">{tr('site.disclaimer')}</div>
	<main id="main">
		{@render children()}
	</main>
	{#if !isMap}
		<footer class="foot">
			<p>
				{tr('site.personal')} <a href="/about">{tr('nav.about')}</a> ·
				<a href="/sources">{tr('nav.sources')}</a>
			</p>
			<p class="credit">{tr('map.credit')}</p>
		</footer>
	{/if}
</div>

<style>
	.skip {
		position: absolute;
		left: -9999px;
		top: 0;
		z-index: 10;
		background: var(--surface);
		padding: 8px 12px;
	}
	.skip:focus {
		left: 8px;
	}
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 20px;
		padding-block: 10px;
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		padding-top: max(10px, env(safe-area-inset-top, 0px));
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		color: var(--ink);
		text-decoration: none;
	}
	.brand b {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 26px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		line-height: 1;
	}
	.brand span {
		color: var(--muted);
		font-size: 13px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-left: auto;
	}
	nav a {
		padding: 6px 10px;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--ink);
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 15px;
		letter-spacing: 0.02em;
	}
	nav a:hover,
	nav a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.lang {
		font-size: 13px;
		padding: 6px 8px;
	}
	.notice {
		padding-block: 6px;
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		font-size: 12.5px;
		color: var(--muted);
		border-bottom: 1px solid var(--line);
	}
	main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.foot {
		padding-block: 18px;
		padding-left: var(--gutter);
		padding-right: var(--gutter-r);
		border-top: 1px solid var(--line);
		font-size: 13px;
		color: var(--muted);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	@media (min-width: 900px) {
		.map-shell {
			height: 100vh;
			height: 100dvh;
			min-height: 0;
		}
		.map-shell main {
			min-height: 0;
		}
	}
	@media (max-width: 640px) {
		.brand span {
			display: none;
		}
		nav {
			margin-left: 0;
			width: 100%;
			flex-wrap: nowrap;
			overflow-x: auto;
		}
		nav a {
			white-space: nowrap;
			padding: 6px 8px;
		}
		.tools {
			position: absolute;
			right: var(--gutter-r);
			top: max(10px, env(safe-area-inset-top, 0px));
		}
		.top {
			position: relative;
		}
	}
</style>
