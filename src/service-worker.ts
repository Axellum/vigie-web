/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Keeps the site's own files so that it opens without a network; data and pages always come from the
// network first (an alert site must not show old alerts as current), with the last copy as a fallback.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `vigie-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) if (key !== CACHE) await caches.delete(key);
		})
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return; // the base map is not cached here
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}
	event.respondWith(
		fetch(request)
			.then((response) => {
				// A private page (an account) is never kept: the device may be shared.
				const priv = /no-store|private/.test(response.headers.get('cache-control') ?? '');
				if (response.ok && !priv && (request.mode === 'navigate' || url.pathname.startsWith('/data/'))) {
					const copy = response.clone();
					caches.open(CACHE).then((cache) => cache.put(request, copy));
				}
				return response;
			})
			.catch(async () => (await caches.match(request)) ?? Response.error())
	);
});
