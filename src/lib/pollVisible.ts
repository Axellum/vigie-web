// A page that asks the site again every so often does it only while it is on screen: a tab in the background
// sends nothing, and when the tab comes back the data is asked at once if it is already older than the delay.

/**
 * Run `run` every `everyMs` while the page is visible. Nothing runs while it is hidden; on the return to
 * visible, `run` is called now if at least `everyMs` passed since its last call. Returns the function that stops it.
 */
export function pollWhileVisible(run: () => void, everyMs: number): () => void {
	if (typeof document === 'undefined') return () => {};
	let last = Date.now();
	const call = () => {
		last = Date.now();
		run();
	};
	const timer = setInterval(() => {
		if (!document.hidden) call();
	}, everyMs);
	const onVisibility = () => {
		if (!document.hidden && Date.now() - last >= everyMs) call();
	};
	document.addEventListener('visibilitychange', onVisibility);
	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
