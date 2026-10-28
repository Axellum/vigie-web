import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// The base map is the only third-party host (tiles, glyphs and sprites of OpenFreeMap).
const MAP_HOST = 'https://tiles.openfreemap.org';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ out: 'build', precompress: true }),
			// The site's stylesheets are small: inlined in the page, they do not delay the first paint (Lighthouse
			// counted 1.3 s on a slow mobile connection for five separate files).
			inlineStyleThreshold: 16 * 1024,

			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// MapLibre and Svelte set inline styles on elements.
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:', MAP_HOST],
					'connect-src': ['self', MAP_HOST],
					'font-src': ['self'],
					// MapLibre starts its worker from a blob: URL.
					'worker-src': ['self', 'blob:'],
					'child-src': ['blob:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	],
	test: { include: ['src/**/*.test.ts'], environment: 'node' }
});
